'use server'

import type { AgentOptions, RequestOptions } from 'http'
import type { LookupFunction } from 'net'
import { createLogger } from '@sim/logger'
import {
  validateExternalUrl,
  isPrivateOrReservedIP,
  type AsyncValidationResult,
  SecureFetchHeaders,
  type SecureFetchOptions,
  type SecureFetchResponse,
} from '@/lib/core/security/input-validation'

const logger = createLogger('InputValidation')

const DEFAULT_MAX_REDIRECTS = 5

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status < 400 && status !== 304
}

function resolveRedirectUrl(baseUrl: string, location: string): string {
  try {
    return new URL(location, baseUrl).toString()
  } catch {
    throw new Error(`Invalid redirect location: ${location}`)
  }
}

/**
 * Validates a URL and resolves its DNS to prevent SSRF via DNS rebinding.
 * Server-only: uses Node dns/promises.
 */
export async function validateUrlWithDNS(
  url: string | null | undefined,
  paramName = 'url'
): Promise<AsyncValidationResult> {
  const basicValidation = validateExternalUrl(url, paramName)
  if (!basicValidation.isValid) {
    return basicValidation
  }

  const parsedUrl = new URL(url!)
  const hostname = parsedUrl.hostname

  try {
    const dns = await import('dns/promises')
    const { address } = await dns.lookup(hostname)

    if (isPrivateOrReservedIP(address)) {
      logger.warn('URL resolves to blocked IP address', {
        paramName,
        hostname,
        resolvedIP: address,
      })
      return {
        isValid: false,
        error: `${paramName} resolves to a blocked IP address`,
      }
    }

    return {
      isValid: true,
      resolvedIP: address,
      originalHostname: hostname,
    }
  } catch (error) {
    logger.warn('DNS lookup failed for URL', {
      paramName,
      hostname,
      error: error instanceof Error ? error.message : String(error),
    })
    return {
      isValid: false,
      error: `${paramName} hostname could not be resolved`,
    }
  }
}

/**
 * Performs a fetch with IP pinning to prevent DNS rebinding attacks.
 * Server-only: uses Node http/https.
 */
export async function secureFetchWithPinnedIP(
  url: string,
  resolvedIP: string,
  options: SecureFetchOptions = {},
  redirectCount = 0
): Promise<SecureFetchResponse> {
  const maxRedirects = options.maxRedirects ?? DEFAULT_MAX_REDIRECTS

  const [httpModule, httpsModule] = await Promise.all([import('http'), import('https')])
  const http = httpModule as unknown as typeof import('http')
  const https = httpsModule as unknown as typeof import('https')

  return new Promise((resolve, reject) => {
    const parsed = new URL(url)
    const isHttps = parsed.protocol === 'https:'
    const defaultPort = isHttps ? 443 : 80
    const port = parsed.port ? Number.parseInt(parsed.port, 10) : defaultPort

    const isIPv6 = resolvedIP.includes(':')
    const family = isIPv6 ? 6 : 4

    const lookup: LookupFunction = (_hostname, opts, callback) => {
      if (opts?.all) {
        callback(null, [{ address: resolvedIP, family }])
      } else {
        callback(null, resolvedIP, family)
      }
    }

    const agentOptions: AgentOptions = { lookup }
    const agent = isHttps ? new https.Agent(agentOptions) : new http.Agent(agentOptions)

    const { 'accept-encoding': _, ...sanitizedHeaders } = options.headers ?? {}

    const requestOptions: RequestOptions = {
      hostname: parsed.hostname,
      port,
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: sanitizedHeaders,
      agent,
      timeout: options.timeout || 30000,
    }

    const protocol = isHttps ? https : http
    const req = protocol.request(requestOptions, (res) => {
      const statusCode = res.statusCode || 0
      const location = res.headers.location

      if (isRedirectStatus(statusCode) && location && redirectCount < maxRedirects) {
        res.resume()
        const redirectUrl = resolveRedirectUrl(url, location)

        validateUrlWithDNS(redirectUrl, 'redirectUrl')
          .then((validation) => {
            if (!validation.isValid) {
              reject(new Error(`Redirect blocked: ${validation.error}`))
              return
            }
            return secureFetchWithPinnedIP(
              redirectUrl,
              validation.resolvedIP!,
              options,
              redirectCount + 1
            )
          })
          .then((response) => {
            if (response) resolve(response)
          })
          .catch(reject)
        return
      }

      if (isRedirectStatus(statusCode) && location && redirectCount >= maxRedirects) {
        res.resume()
        reject(new Error(`Too many redirects (max: ${maxRedirects})`))
        return
      }

      const chunks: Buffer[] = []

      res.on('data', (chunk: Buffer) => chunks.push(chunk))

      res.on('error', (error) => {
        reject(error)
      })

      res.on('end', () => {
        const bodyBuffer = Buffer.concat(chunks)
        const body = bodyBuffer.toString('utf-8')
        const headersRecord: Record<string, string> = {}
        for (const [key, value] of Object.entries(res.headers)) {
          if (typeof value === 'string') {
            headersRecord[key.toLowerCase()] = value
          } else if (Array.isArray(value)) {
            headersRecord[key.toLowerCase()] = value.join(', ')
          }
        }

        resolve({
          ok: statusCode >= 200 && statusCode < 300,
          status: statusCode,
          statusText: res.statusMessage || '',
          headers: new SecureFetchHeaders(headersRecord),
          text: async () => body,
          json: async () => JSON.parse(body),
          arrayBuffer: async () =>
            bodyBuffer.buffer.slice(
              bodyBuffer.byteOffset,
              bodyBuffer.byteOffset + bodyBuffer.byteLength
            ),
        })
      })
    })

    req.on('error', (error) => {
      reject(error)
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request timeout'))
    })

    if (options.body) {
      req.write(options.body)
    }

    req.end()
  })
}

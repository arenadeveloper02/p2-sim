const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\./,
  /^\[::1\]$/,
  /^metadata\.google\.internal$/i,
]

export interface HttpAllowlistCheck {
  ok: boolean
  host?: string
  error?: string
}

function isPrivateHost(hostname: string): boolean {
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(hostname))
}

/**
 * Parses a URL and rejects private/loopback hosts. Production requires https.
 */
export function inspectHttpBindingUrl(
  rawUrl: string,
  options?: { allowHttp?: boolean }
): HttpAllowlistCheck {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { ok: false, error: `Invalid URL: ${rawUrl}` }
  }

  const allowHttp = options?.allowHttp === true
  if (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:')) {
    return { ok: false, error: 'HTTP bindings must use https' }
  }

  const host = parsed.hostname.toLowerCase()
  if (!host) {
    return { ok: false, error: 'URL is missing a host' }
  }
  if (isPrivateHost(host)) {
    return { ok: false, error: `Host "${host}" is not allowed` }
  }

  return { ok: true, host }
}

/**
 * Builds the publish-time host allowlist from HTTP API bindings.
 */
export function buildHttpAllowlist(
  bindings: Array<{ kind: string; http?: { url?: string } }>,
  options?: { allowHttp?: boolean }
): { ok: true; hosts: string[] } | { ok: false; error: string } {
  const hosts = new Set<string>()
  for (const binding of bindings) {
    if (binding.kind !== 'http') continue
    const url = binding.http?.url?.trim()
    if (!url) {
      return { ok: false, error: 'HTTP binding is missing a URL' }
    }
    const inspected = inspectHttpBindingUrl(url, options)
    if (!inspected.ok || !inspected.host) {
      return { ok: false, error: inspected.error ?? 'Invalid HTTP binding URL' }
    }
    hosts.add(inspected.host)
  }
  return { ok: true, hosts: [...hosts] }
}

/**
 * Returns true when the request URL host is in the published allowlist.
 */
export function isHttpUrlAllowlisted(
  rawUrl: string,
  allowlist: string[],
  options?: { allowHttp?: boolean }
): HttpAllowlistCheck {
  const inspected = inspectHttpBindingUrl(rawUrl, options)
  if (!inspected.ok || !inspected.host) {
    return inspected
  }
  if (!allowlist.includes(inspected.host)) {
    return { ok: false, host: inspected.host, error: `Host "${inspected.host}" is not allowlisted` }
  }
  return inspected
}

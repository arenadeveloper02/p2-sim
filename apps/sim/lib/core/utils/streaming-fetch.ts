import { toError } from '@sim/utils/errors'
import { request as undiciRequest } from 'undici'
import { nodeReadableToWebStream } from '@/lib/core/utils/node-stream'

export interface StreamingPostInit {
  headers: Record<string, string>
  body: string
}

export interface StreamingPostResult {
  status: number
  ok: boolean
  body: ReadableStream<Uint8Array> | null
  errorText: string
}

/**
 * POSTs and returns a live WHATWG body stream.
 *
 * Uses `undici.request` instead of `fetch` so Next.js's patched fetch and Bun's
 * `undici.fetch` ReadableStream bridge cannot lock or stall the body before the
 * caller reads it.
 */
export async function fetchStreamingPost(
  url: string,
  init: StreamingPostInit
): Promise<StreamingPostResult> {
  const { statusCode, body } = await undiciRequest(url, {
    method: 'POST',
    headers: init.headers,
    body: init.body,
  })

  const ok = statusCode >= 200 && statusCode < 300
  const isNullBody = statusCode === 204 || statusCode === 205 || statusCode === 304

  if (isNullBody) {
    body.on('error', () => {})
    body.resume()
    return { status: statusCode, ok, body: null, errorText: '' }
  }

  if (!ok) {
    const chunks: Buffer[] = []
    try {
      for await (const chunk of body) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
      }
    } catch (error) {
      return { status: statusCode, ok, body: null, errorText: toError(error).message }
    }
    return {
      status: statusCode,
      ok,
      body: null,
      errorText: Buffer.concat(chunks).toString('utf8'),
    }
  }

  return {
    status: statusCode,
    ok,
    body: nodeReadableToWebStream(body),
    errorText: '',
  }
}

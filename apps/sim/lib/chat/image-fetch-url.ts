interface GetChatImageFetchUrlOptions {
  /** Page origin; defaults to `window.location.origin` in the browser. */
  origin?: string
}

/**
 * Returns true when the value points at a file already stored in this app.
 */
export function isInternalServeUrl(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.includes('/api/files/serve/')
}

/**
 * Resolves the best source URL for reusing an image. Keeps existing serve URLs unchanged;
 * only falls back to storage key for presigned or other non-serve URLs.
 */
export function resolveChatImageSourceUrl(image: { url: string; key?: string }): string {
  const url = image.url.trim()
  if (!url) {
    const key = image.key?.trim()
    if (key) {
      return `/api/files/serve/${encodeURIComponent(key)}`
    }
    return url
  }

  if (url.startsWith('data:') || url.startsWith('blob:') || isInternalServeUrl(url)) {
    return url
  }

  const key = image.key?.trim()
  if (key) {
    return `/api/files/serve/${encodeURIComponent(key)}`
  }

  return url
}

/**
 * Returns a URL suitable for `fetch` with credentials when reusing a generated image in chat.
 * Same-origin `/api/files/serve/...` paths hit the app directly; cross-origin serve URLs and
 * other external HTTP(S) image URLs use the image proxy (matches chat display/download behavior).
 */
export function getChatImageFetchUrl(url: string, options?: GetChatImageFetchUrlOptions): string {
  const trimmed = url.trim()
  if (!trimmed) {
    return trimmed
  }

  if (trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
    return trimmed
  }

  const origin =
    options?.origin ?? (typeof window !== 'undefined' ? window.location.origin : undefined)
  if (!origin) {
    return trimmed
  }

  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`

  try {
    if (trimmed.startsWith('/api/files/serve/')) {
      const queryIndex = trimmed.indexOf('?')
      const pathname = queryIndex === -1 ? trimmed : trimmed.slice(0, queryIndex)
      const search = queryIndex === -1 ? '' : trimmed.slice(queryIndex)
      return `${origin}${pathname}${search}`
    }

    if (!trimmed.startsWith('http')) {
      return trimmed
    }

    const parsed = new URL(trimmed)

    if (parsed.pathname.startsWith('/api/files/serve/')) {
      if (parsed.origin === origin) {
        return `${origin}${parsed.pathname}${parsed.search}`
      }
      return `${origin}/api/files/proxy-image?url=${encodeURIComponent(trimmed)}`
    }

    if (parsed.origin === origin) {
      return parsed.toString()
    }

    return `${origin}/api/files/proxy-image?url=${encodeURIComponent(trimmed)}`
  } catch {
    return withSlash.startsWith('/') ? `${origin}${withSlash}` : trimmed
  }
}

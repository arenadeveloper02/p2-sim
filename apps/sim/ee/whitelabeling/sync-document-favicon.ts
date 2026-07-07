/**
 * Updates browser tab favicon links to match the resolved org/instance brand URL.
 */
export function syncDocumentFavicon(faviconUrl: string | undefined): void {
  if (!faviconUrl || typeof document === 'undefined') {
    return
  }

  const iconLinks = document.querySelectorAll<HTMLLinkElement>("link[rel*='icon']")
  if (iconLinks.length > 0) {
    for (const link of iconLinks) {
      link.href = faviconUrl
    }
    return
  }

  const link = document.createElement('link')
  link.rel = 'icon'
  link.href = faviconUrl
  document.head.appendChild(link)
}

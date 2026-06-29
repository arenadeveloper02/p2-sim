interface GetMothershipChatPathOptions {
  /** When true, keep the user on an embed surface (no workspace sidebar). */
  embed?: boolean
  /** Optional query string (`?foo=bar` or `foo=bar`). */
  search?: string
}

/**
 * Canonical client URL for an active mothership chat.
 * Embed surfaces use `/task/:chatId/embed` so workspace chrome stays fullscreen.
 */
export function getMothershipChatPath(
  workspaceId: string,
  chatId: string,
  options?: GetMothershipChatPathOptions
): string {
  const base = options?.embed
    ? `/workspace/${workspaceId}/task/${chatId}/embed`
    : `/workspace/${workspaceId}/chat/${chatId}`

  const rawSearch = options?.search?.trim()
  if (!rawSearch) return base

  return rawSearch.startsWith('?') ? `${base}${rawSearch}` : `${base}?${rawSearch}`
}

/**
 * Reads the current location search string when running in the browser.
 */
export function readMothershipChatSearch(): string {
  if (typeof window === 'undefined') return ''
  return window.location.search
}

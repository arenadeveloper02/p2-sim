/**
 * Whether the chat trailing indicator should show during an in-flight turn.
 *
 * Always prefer server `liveStatus` when present. Otherwise keep a Thinking…
 * pulse while tools are running or the turn has no trailing text yet — otherwise
 * finished-looking tool rows make the chat feel stuck between model rounds.
 */
export function shouldShowTrailingLiveStatus(opts: {
  isStreaming: boolean
  liveStatus?: string
  hasTrailingContent: boolean
  hasRunningWork: boolean
}): boolean {
  if (!opts.isStreaming) return false
  if (opts.liveStatus?.trim()) return true
  if (opts.hasRunningWork) return true
  return !opts.hasTrailingContent
}

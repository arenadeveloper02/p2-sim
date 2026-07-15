/**
 * Whether the chat trailing indicator should show during an in-flight turn.
 * When `liveStatus` is set, show even while tool rows are running.
 */
export function shouldShowTrailingLiveStatus(opts: {
  isStreaming: boolean
  liveStatus?: string
  hasTrailingContent: boolean
  hasRunningWork: boolean
}): boolean {
  if (!opts.isStreaming) return false
  if (opts.liveStatus?.trim()) return true
  return !opts.hasTrailingContent && !opts.hasRunningWork
}

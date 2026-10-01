/**
 * Computes the thinking text that still needs to be shown in the UI when a
 * completed Anthropic / Claude-proxy `thinking_block` arrives.
 *
 * Native Anthropic usually streams the same text via `thinking` deltas first;
 * Claude-via-proxy often only delivers signed `thinking_blocks` with no
 * `reasoning_content` deltas. In that case the full block body must become a
 * `thinking_delta` or CoT never appears outside Vertex/Gemini.
 */
export function unresolvedThinkingBlockText(
  alreadyStreamed: string,
  blockThinking: string
): string {
  const full = blockThinking.trimEnd()
  if (!full) return ''
  if (!alreadyStreamed) return full
  if (full.startsWith(alreadyStreamed)) {
    return full.slice(alreadyStreamed.length)
  }
  // Proxy re-sent a full snapshot that does not prefix-match (rare). Avoid
  // duplicating CoT in the chrome when we already showed a live stream.
  return ''
}

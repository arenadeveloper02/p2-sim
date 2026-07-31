/**
 * Helpers that keep Arena Copilot user-facing text clean and stop tool thrash
 * after a successful workflow build.
 */

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi

/** After a successful populate, restrict which tools the model may still call. */
export type PostBuildToolMode = 'all' | 'oauth_only' | 'final_only' | 'done'

const COMPLETION_MARKERS = [
  'connect gmail',
  'built and wired',
  'start → fetch',
  'start -> fetch',
  'newer_than:',
  'one step left',
  'one thing left',
  'only remaining',
  'authorize gmail',
] as const

/**
 * Removes UUIDs from prose (e.g. "Start block ID is …") without destroying
 * auth/callback URLs that embed workspace or workflow ids.
 */
export function stripIdsFromUserFacingText(text: string): string {
  const urls: string[] = []
  const withUrlPlaceholders = text.replace(/https?:\/\/\S+/gi, (url) => {
    urls.push(url)
    return `<<URL_${urls.length - 1}>>`
  })

  const stripped = withUrlPlaceholders
    .replace(
      /\b(?:start\s+)?block\s+id(?:s)?\s*(?:is|are|=|:)\s*[0-9a-f-]{36}\b/gi,
      'the Start block'
    )
    .replace(UUID_PATTERN, '')
    .replace(/\(\s*ID\s*`*`\s*\)/gi, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ?\n{3,}/g, '\n\n')

  return stripped.replace(/<<URL_(\d+)>>/g, (_, index) => urls[Number(index)] ?? '')
}

/**
 * System nudge after a successful populate edit with no repair follow-up.
 */
export function buildWorkflowBuildCompleteSystemMessage(mode: PostBuildToolMode): string {
  if (mode === 'oauth_only') {
    return (
      '[System] Workflow populate succeeded. Call oauth_get_auth_link once for the missing provider, ' +
      'then STOP. Do not validate, re-edit, or re-fetch metadata. ' +
      'The Connect control is shown automatically from the tool result — do not invent URLs.'
    )
  }
  return (
    '[System] Workflow populate succeeded. No further tools. ' +
    'Reply once: short summary of what was built (display names only), then at most one <options> block. ' +
    'Do not restate or re-verify.'
  )
}

/**
 * System nudge when block metadata was already fetched this turn.
 */
export function buildBlocksMetadataReuseSystemMessage(): string {
  return (
    '[System] Block metadata was already fetched this turn. ' +
    'Reuse that result. Call get_blocks_metadata again ONLY for new block types not covered yet — ' +
    'prefer one call with every type you need (e.g. agent, start_trigger, gmail).'
  )
}

/**
 * True when an edit_workflow LLM result still requires a repair edit.
 */
export function editResultNeedsFollowUp(llmFormattedJson: string): boolean {
  try {
    const parsed = JSON.parse(llmFormattedJson) as Record<string, unknown>
    return parsed.needsFollowUpEdit === true || parsed.needsFollowUpPopulate === true
  } catch {
    return false
  }
}

/**
 * Whether the workspace already has a usable Gmail/Google Email OAuth credential.
 */
export function workspaceHasGmailCredential(
  connected: Array<{ providerId: string }> | undefined
): boolean {
  if (!connected?.length) return false
  return connected.some((item) => {
    const id = item.providerId.toLowerCase()
    return (
      id.includes('google-email') ||
      id.includes('gmail') ||
      id === 'google-email' ||
      id.endsWith('/gmail')
    )
  })
}

function normalizeCompletionText(text: string): string {
  return text
    .toLowerCase()
    .replace(/<options>[\s\S]*?<\/options>/gi, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^a-z0-9→\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Detects repeated "workflow is built / connect Gmail" completion paragraphs.
 * Pass only text from *earlier rounds* as `previous` — never the current round's
 * own growing prefix (that falsely suppresses the first completion mid-stream).
 */
export function isNearDuplicateCompletion(previous: string, next: string): boolean {
  const a = normalizeCompletionText(previous)
  const b = normalizeCompletionText(next)
  if (b.length < 100 || a.length < 100) return false

  const aMarkers = COMPLETION_MARKERS.filter((marker) => a.includes(marker)).length
  const bMarkers = COMPLETION_MARKERS.filter((marker) => b.includes(marker)).length
  if (aMarkers >= 2 && bMarkers >= 2) return true

  const probe = b.slice(0, Math.min(160, b.length))
  return probe.length >= 80 && a.includes(probe)
}

/**
 * Mid-turn scaffolding the model often emits alone ("Let me retry…") before the
 * next tool round. Streaming these leaves the settled bubble looking empty once
 * tool rows collapse — keep them in the LLM transcript only.
 */
const BRIDGING_NARRATION_PATTERN =
  /^(?:okay[,.]?\s+|ok[,.]?\s+|sure[,.]?\s+|alright[,.]?\s+)?(?:let me|i(?:'| a)?m going to|i(?:'| wi)?ll|i need to|now i(?:'| wi)?ll|one (?:sec|moment|second)|hang on|give me a (?:sec|moment|second))\b[\s\S]{0,160}$/i

/**
 * True when prose is only a short bridge into more tool work, not a real answer.
 */
export function isBridgingAssistantNarration(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return false
  if (normalized.length > 180) return false
  if (BRIDGING_NARRATION_PATTERN.test(normalized)) return true
  // Explicit retry / re-call lines without a substantive finding.
  return /^(?:retrying|re-?trying|trying again)\b[\s\S]{0,120}$/i.test(normalized)
}

/**
 * Whether buffered model prose for this round should be streamed to the UI.
 * Tool rounds keep text in the LLM transcript only — streaming it between tool
 * batches creates repeated "Arena Copilot" mothership headers. Bridging
 * narration is also held back so a later synthesize/summary can own the bubble.
 */
export function shouldStreamAssistantRoundText(options: {
  hasToolCalls: boolean
  contentBeforeRound: string
  display: string
}): boolean {
  if (!options.display.trim()) return false
  if (options.hasToolCalls) return false
  if (isBridgingAssistantNarration(options.display)) return false
  if (
    options.contentBeforeRound.trim().length > 120 &&
    isNearDuplicateCompletion(options.contentBeforeRound, options.display)
  ) {
    return false
  }
  return true
}

/**
 * True when the only user-visible prose so far is empty or bridging, so a tool
 * turn should synthesize a real closing summary instead of settling on it.
 */
export function shouldSynthesizeAssistantSummary(options: {
  streamedUserFacingText: string
  toolRecordCount: number
}): boolean {
  if (options.toolRecordCount <= 0) return false
  const streamed = options.streamedUserFacingText.trim()
  if (!streamed) return true
  return isBridgingAssistantNarration(streamed)
}

/**
 * True when every pending mandatory follow-up is OAuth connect (not an edit repair).
 */
export function pendingFollowUpsAreOauthOnly(
  pending: Array<{ resolveWith: string[] }>
): boolean {
  return (
    pending.length > 0 &&
    pending.every(
      (item) =>
        item.resolveWith.length > 0 &&
        item.resolveWith.every((toolName) => toolName === 'oauth_get_auth_link')
    )
  )
}

/**
 * Helpers that keep Arena Copilot user-facing text clean and stop tool thrash
 * after a successful workflow build.
 */

import { stripOptionsTagsForDisplay } from '@/local-copilot/lib/format-options-tag'
import { stripUntrustedSecurityControls } from '@/local-copilot/lib/security/trusted-controls'

/** Any UUID-shaped token (not only RFC version/variant nibbles). */
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi

/** Anthropic / OpenAI / Responses API tool-call ids. */
const PROVIDER_TOOL_CALL_ID_PATTERN = /\b(?:toolu_|call_|fc_)[A-Za-z0-9_-]{6,}\b/g

/**
 * CamelCase id labels the model often echoes from tool JSON
 * (`workflowId: …`, `blockId=…`, `[messageId:…]`).
 */
const LABELED_ID_PATTERN =
  /\b(?:workflow|block|execution|message|patch|chat|conversation|tool(?:Call)?|start(?:Block)?|job|file|document)Id\b\s*[:=]\s*[`'"[]?[A-Za-z0-9_-]+[`'"\]]?/gi

const MESSAGE_ID_BRACKET_PATTERN = /\[messageId:[^\]]*\]/gi

/** Privileged tags that must keep embedded ids for Apply/Approve UI. */
const PRIVILEGED_CONTROL_TAG_PATTERN =
  /<(credential|workspace_resource|tool_confirmation|workflow_patch)>[\s\S]*?<\/\1>/gi

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
 * Removes internal ids from prose without destroying auth/callback URLs or
 * privileged control tags that need ids for Apply/Approve UI.
 */
export function stripIdsFromUserFacingText(text: string): string {
  if (!text) return text

  const protectedSegments: string[] = []
  const protect = (segment: string): string => {
    protectedSegments.push(segment)
    return `<<PROT_${protectedSegments.length - 1}>>`
  }

  const withProtected = text
    .replace(PRIVILEGED_CONTROL_TAG_PATTERN, (tag) => protect(tag))
    .replace(/https?:\/\/\S+/gi, (url) => protect(url))

  const stripped = withProtected
    .replace(
      /\b(?:start\s+)?block\s+id(?:s)?\s*(?:is|are|=|:)\s*[0-9a-f-]{36}\b/gi,
      'the Start block'
    )
    .replace(MESSAGE_ID_BRACKET_PATTERN, '')
    .replace(LABELED_ID_PATTERN, '')
    .replace(
      /\b(?:an?\s+)?(?:workflow|block|execution|message|patch|tool|chat|conversation)\s+ids?\s*(?:is|are|=|:)\s*[`'"[]?[A-Za-z0-9_-]+[`'"\]]?/gi,
      ''
    )
    .replace(PROVIDER_TOOL_CALL_ID_PATTERN, '')
    .replace(UUID_PATTERN, '')
    .replace(/\(\s*IDs?\s*:?\s*\)/gi, '')
    .replace(/\bIDs?\s*:?\s*(?=[.,;)\]]|$)/gi, '')
    .replace(/\[\s*\]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ ?\n{3,}/g, '\n\n')
    .replace(/[ \t]+([.,;:])/g, '$1')

  return stripped.replace(/<<PROT_(\d+)>>/g, (_, index) => protectedSegments[Number(index)] ?? '')
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
 * Model announced a mutation ("Now applying…") but produced no tool call.
 * Treat as bridging so the turn does not settle on intent-only prose.
 */
const MUTATION_INTENT_NARRATION_PATTERN =
  /^(?:okay[,.]?\s+|ok[,.]?\s+|sure[,.]?\s+|alright[,.]?\s+|now[,.]?\s+)?(?:(?:i(?:'| a)?m |i(?:'| wi)?ll |let me )+)?(?:now\s+)?(?:applying|editing|updating|fixing|redeploying|deploying|wiring|patching|saving)\b[\s\S]{0,220}$/i

const POLITE_BRIDGING_PREFIX =
  /^(?:okay[,.]?\s+|ok[,.]?\s+|sure[,.]?\s+|alright[,.]?\s+|now[,.]?\s+)/i
const BARE_POLITE_TOKEN = /^(?:okay|ok|sure|alright|now)[,.]?$/i

/**
 * Known openers for tool-bridging narration. Used to hold incomplete streaming
 * prefixes (e.g. "Let") before the full "Let me…" phrase exists.
 */
const BRIDGING_OPENERS = [
  'let me',
  "i'm going to",
  'i am going to',
  "i'll",
  'i will',
  'i need to',
  "now i'll",
  'now i will',
  'one sec',
  'one moment',
  'one second',
  'hang on',
  'give me a sec',
  'give me a moment',
  'give me a second',
  'retrying',
  're-trying',
  'trying again',
  'applying',
  'editing',
  'updating',
  'fixing',
  'redeploying',
  'deploying',
  'wiring',
  'patching',
  'saving',
] as const

/**
 * True when text is only a partial opener for bridging narration (e.g. "Let").
 * Streaming these before tools creates orphan mothership bubbles.
 */
export function isIncompleteBridgingPrefix(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase()
  if (!normalized || normalized.length > 48) return false
  if (BARE_POLITE_TOKEN.test(normalized)) return true

  const body = normalized.replace(POLITE_BRIDGING_PREFIX, '').trim()
  if (!body) return true

  return BRIDGING_OPENERS.some((opener) => opener.startsWith(body))
}

/**
 * True for a single short token that is almost certainly mid-stream scaffolding
 * ("I", "So", "I'll") rather than a finished reply.
 */
export function isLikelyMidStreamToken(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim()
  return /^[A-Za-z][A-Za-z']{0,11}$/.test(normalized)
}

/**
 * True when prose is only a short bridge into more tool work, not a real answer.
 */
export function isBridgingAssistantNarration(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return false
  if (normalized.length > 220) return false
  if (isIncompleteBridgingPrefix(normalized)) return true
  if (BRIDGING_NARRATION_PATTERN.test(normalized)) return true
  if (MUTATION_INTENT_NARRATION_PATTERN.test(normalized)) return true
  // Explicit retry / re-call lines without a substantive finding.
  return /^(?:retrying|re-?trying|trying again)\b[\s\S]{0,120}$/i.test(normalized)
}

/**
 * True when the model narrated an imminent edit/deploy/run but did not call a tool.
 */
export function isUnfulfilledMutationIntentNarration(text: string): boolean {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized || normalized.length > 220) return false
  return MUTATION_INTENT_NARRATION_PATTERN.test(normalized)
}

/**
 * System nudge when the model described a mutation without issuing the tool call.
 */
export function buildUnfulfilledIntentContinuationMessage(): string {
  return (
    '[System] You described applying/editing/deploying changes but did not call a tool. ' +
    'Call the required tool now (usually edit_workflow, or redeploy/deploy_chat if that was the next step). ' +
    'Do not only narrate the plan.'
  )
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

export interface AssistantRoundTextStreamerOptions {
  /** When true, hold short bridging narration until it grows into a real reply. */
  toolsAvailable: boolean
  /** User-visible prose already streamed in earlier rounds of this turn. */
  contentBeforeRound: string
}

export interface AssistantRoundTextStreamer {
  /** Raw model text accumulated this round (including options tags). */
  readonly roundRawText: string
  /** True after a tool_call chunk was observed — further text stays transcript-only. */
  readonly sawToolCall: boolean
  /** Append a cleaned text chunk; returns a UI delta when live streaming is allowed. */
  pushText: (cleaned: string) => string | null
  /** Stop live streaming for the rest of the round (tool call observed). */
  markToolCall: () => void
  /**
   * Final display text + any remainder delta after options tags resolve.
   * `remainder` is null when the round should not show user-facing prose.
   */
  finalize: () => { display: string; remainder: string | null }
}

/**
 * Incremental assistant-text emitter for one model round.
 *
 * Streams token deltas live for real replies (holding incomplete `<options>` and
 * short bridging narration when tools are still available). Stops emitting once a
 * tool call appears so tool batches do not open repeated mothership headers.
 */
export function createAssistantRoundTextStreamer(
  options: AssistantRoundTextStreamerOptions
): AssistantRoundTextStreamer {
  let roundRawText = ''
  let emittedDisplay = ''
  let sawToolCall = false

  const toDisplay = (raw: string, isStreaming: boolean) =>
    stripIdsFromUserFacingText(
      stripOptionsTagsForDisplay(stripUntrustedSecurityControls(raw, isStreaming), isStreaming)
    )

  const deltaFrom = (display: string): string | null => {
    if (!display) return null
    if (display === emittedDisplay) return null
    if (display.startsWith(emittedDisplay)) {
      const delta = display.slice(emittedDisplay.length)
      if (!delta) return null
      emittedDisplay = display
      return delta
    }
    // Display rewrite shortened/replaced an earlier prefix (rare); emit the new tail only
    // when the previous emission is empty, otherwise skip to avoid duplicated prose.
    if (!emittedDisplay) {
      emittedDisplay = display
      return display
    }
    emittedDisplay = display
    return null
  }

  const streamer: AssistantRoundTextStreamer = {
    get roundRawText() {
      return roundRawText
    },
    get sawToolCall() {
      return sawToolCall
    },
    pushText(cleaned: string) {
      if (!cleaned) return null
      roundRawText += cleaned
      if (sawToolCall) return null

      const display = toDisplay(roundRawText, true)
      if (!display) return null

      // With tools available, hold "Let me…" scaffolding (and incomplete prefixes
      // like "Let" / "I" / "So") until it is clearly a real reply — otherwise
      // mothership opens orphan bubbles when tools interrupt mid-sentence.
      if (
        options.toolsAvailable &&
        (isBridgingAssistantNarration(display) || isLikelyMidStreamToken(display))
      ) {
        return null
      }

      if (
        options.contentBeforeRound.trim().length > 120 &&
        isNearDuplicateCompletion(options.contentBeforeRound, display)
      ) {
        return null
      }

      return deltaFrom(display)
    },
    markToolCall() {
      sawToolCall = true
    },
    finalize() {
      const display = toDisplay(roundRawText, false)
      if (
        !shouldStreamAssistantRoundText({
          hasToolCalls: sawToolCall,
          contentBeforeRound: options.contentBeforeRound,
          display,
        })
      ) {
        return { display, remainder: null }
      }

      const remainder = deltaFrom(display)
      return { display, remainder }
    },
  }

  return streamer
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
export function pendingFollowUpsAreOauthOnly(pending: Array<{ resolveWith: string[] }>): boolean {
  return (
    pending.length > 0 &&
    pending.every(
      (item) =>
        item.resolveWith.length > 0 &&
        item.resolveWith.every((toolName) => toolName === 'oauth_get_auth_link')
    )
  )
}

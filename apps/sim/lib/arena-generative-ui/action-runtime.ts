import type { ArenaGenerativeActionSurface } from '@/lib/arena-generative-ui/chat-protocol'
import { lastAssistantPatch } from '@/lib/arena-generative-ui/chat-turns'
import type { RunDeployedAppActionResult } from '@/lib/arena-generative-ui/run-action'
import {
  ARENA_GENERATIVE_CHAT_TURNS_KEY,
  ARENA_GENERATIVE_ERROR_KEY,
  ARENA_GENERATIVE_SCHEMA_WARNING_KEY,
  ARENA_GENERATIVE_STREAM_CONTENT_KEY,
} from '@/lib/arena-generative-ui/types'

export const GENERATIVE_APP_SUCCESS_TOAST_MS = 4000

const VISITOR_ERROR_FAILED = "This didn't go through. Try again."
const VISITOR_ERROR_TIMEOUT = 'This is taking too long. Try again.'
const VISITOR_ERROR_UNAVAILABLE = "This action isn't available right now."

const IMPLEMENTATION_DETAIL =
  /ENCRYPTION_KEY|allowlist|not allowlisted|https?:\/\/|ECONNREFUSED|workflowId|secret name|stack trace|\bat [\w$.]+\s*\(/i

/**
 * Strip HTTP status, URLs, and implementation detail so the visitor banner
 * explains the problem without leaking internals.
 */
export function visitorFacingActionError(raw: string): string {
  const text = raw.trim()
  if (!text) return VISITOR_ERROR_FAILED

  if (/timed out/i.test(text) || /\btimeout\b/i.test(text)) return VISITOR_ERROR_TIMEOUT
  if (/exceeded 1 MB/i.test(text) || /too large/i.test(text)) return VISITOR_ERROR_FAILED
  if (
    /allowlist/i.test(text) ||
    /not allowlisted/i.test(text) ||
    /Host "[^"]+" is not allowed/i.test(text) ||
    /ENCRYPTION_KEY/i.test(text) ||
    /not deployed/i.test(text) ||
    /Bound workflow/i.test(text) ||
    /missing workflowId/i.test(text)
  ) {
    return VISITOR_ERROR_UNAVAILABLE
  }

  const http = text.match(/^HTTP\s+(\d+)\s*(?::\s*(.*))?$/i)
  if (http) {
    const detail = http[2]?.trim() ?? ''
    if (detail && !IMPLEMENTATION_DETAIL.test(detail)) {
      return stripVisitorErrorNoise(detail)
    }
    return VISITOR_ERROR_FAILED
  }

  if (IMPLEMENTATION_DETAIL.test(text)) return VISITOR_ERROR_UNAVAILABLE
  return stripVisitorErrorNoise(text)
}

function stripVisitorErrorNoise(value: string): string {
  return value
    .replace(/^HTTP\s+\d+\s*:\s*/i, '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface GenerativeAppLastAction {
  actionId: string
  values: Record<string, unknown>
  surface?: ArenaGenerativeActionSurface
}

export interface RunGenerativeAppActionMeta {
  destructive?: boolean
  surface?: ArenaGenerativeActionSurface
}

export interface ActionGenerationClock {
  begin: (actionId: string) => number
  isCurrent: (actionId: string, generation: number) => boolean
}

/**
 * Per-action generation counter so a late response cannot overwrite a newer one
 * for the same action id.
 */
export function createActionGenerationClock(): ActionGenerationClock {
  const current = new Map<string, number>()
  return {
    begin(actionId) {
      const next = (current.get(actionId) ?? 0) + 1
      current.set(actionId, next)
      return next
    },
    isCurrent(actionId, generation) {
      return current.get(actionId) === generation
    },
  }
}

/**
 * On failure, omit empty `content` so already-streamed tokens are not wiped.
 */
export function setStatePreservingStreamContent(
  patch: Record<string, unknown> | undefined,
  ok: boolean
): Record<string, unknown> | undefined {
  if (!patch || ok) return patch
  const key = ARENA_GENERATIVE_STREAM_CONTENT_KEY
  const incoming = patch[key]
  if (incoming !== undefined && incoming !== '') return patch
  const next = { ...patch }
  delete next[key]
  return next
}

/**
 * Same-page success toast only when nothing on the page already shows the
 * result (navigate-first and streamed/bound output are the success).
 */
export function shouldShowSaveToast(options: {
  ok: boolean
  navigateTo?: string
  resultNavigate?: string
  streaming: boolean
  setState?: Record<string, unknown>
}): boolean {
  if (!options.ok || options.streaming) return false
  if (options.navigateTo || options.resultNavigate) return false
  const patch = options.setState
  if (!patch) return true
  return !Object.entries(patch).some(([key, value]) => {
    if (key === ARENA_GENERATIVE_ERROR_KEY || key === ARENA_GENERATIVE_SCHEMA_WARNING_KEY) {
      return false
    }
    return value !== undefined
  })
}

/**
 * Host state patch for a settled action. Does not navigate — caller owns that.
 */
export function hostStatePatchFromResult(result: RunDeployedAppActionResult): {
  patch: Record<string, unknown>
  appendKeys?: string[]
} {
  const preserved = setStatePreservingStreamContent(result.setState, result.ok)
  const patch: Record<string, unknown> = preserved ? { ...preserved } : {}
  delete patch[ARENA_GENERATIVE_CHAT_TURNS_KEY]
  if (!result.ok) {
    patch[ARENA_GENERATIVE_ERROR_KEY] = visitorFacingActionError(result.error ?? 'Action failed')
  }
  return {
    patch,
    appendKeys: result.appendKeys,
  }
}

/**
 * After a chat CTA settles, copy display `content` onto the last assistant turn.
 */
export function chatResultLastAssistantPatch(
  patch: Record<string, unknown>
): Record<string, unknown> {
  const text = patch[ARENA_GENERATIVE_STREAM_CONTENT_KEY]
  if (typeof text !== 'string' || !text) return patch
  return { ...patch, ...lastAssistantPatch(text) }
}

import type { RunDeployedAppActionResult } from '@/lib/arena-generative-ui/run-action'
import {
  ARENA_GENERATIVE_ERROR_KEY,
  ARENA_GENERATIVE_SCHEMA_WARNING_KEY,
  ARENA_GENERATIVE_STREAM_CONTENT_KEY,
} from '@/lib/arena-generative-ui/types'

export const GENERATIVE_APP_SUCCESS_TOAST_MS = 4000

export interface GenerativeAppLastAction {
  actionId: string
  values: Record<string, unknown>
}

export interface RunGenerativeAppActionMeta {
  destructive?: boolean
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
export function hostStatePatchFromResult(
  result: RunDeployedAppActionResult
): { patch: Record<string, unknown>; appendKeys?: string[] } {
  const preserved = setStatePreservingStreamContent(result.setState, result.ok)
  const patch: Record<string, unknown> = preserved ? { ...preserved } : {}
  if (!result.ok) {
    patch[ARENA_GENERATIVE_ERROR_KEY] = result.error ?? 'Action failed'
  }
  return {
    patch,
    appendKeys: result.appendKeys,
  }
}

/**
 * Per-turn budget for Local Copilot specialist invocations (pre-pass + mid-turn + nested).
 *
 * Depth is parent-relative: callers pass the parent agent depth (main = 0). Parallel
 * siblings under the same parent each call `tryEnter(parentDepth)` and receive
 * `parentDepth + 1`.
 */

export const MAX_SPECIALIST_DEPTH = 3
export const MAX_SPECIALIST_CONCURRENT = 4
export const MAX_SPECIALIST_INVOCATIONS = 8
export const SPECIALIST_TIMEOUT_MS = 90_000

export interface SpecialistBudgetOptions {
  maxDepth?: number
  maxConcurrent?: number
  maxInvocations?: number
  timeoutMs?: number
}

export interface SpecialistBudgetEnterOk {
  ok: true
  depth: number
  release: () => void
}

export interface SpecialistBudgetEnterFail {
  ok: false
  reason: string
}

export type SpecialistBudgetEnterResult = SpecialistBudgetEnterOk | SpecialistBudgetEnterFail

export interface SpecialistBudget {
  readonly maxDepth: number
  readonly maxConcurrent: number
  readonly maxInvocations: number
  readonly timeoutMs: number
  readonly invocationCount: number
  readonly activeCount: number
  readonly maxDepthReached: number
  /**
   * Reserves one specialist slot at `parentDepth + 1`.
   * Main agent uses `tryEnter(0)`; a specialist at depth N nests with `tryEnter(N)`.
   */
  tryEnter: (parentDepth?: number) => SpecialistBudgetEnterResult
  snapshot: () => {
    invocationCount: number
    activeCount: number
    maxDepthReached: number
  }
}

/**
 * Creates a turn-scoped specialist budget.
 */
export function createSpecialistBudget(options: SpecialistBudgetOptions = {}): SpecialistBudget {
  const maxDepth = options.maxDepth ?? MAX_SPECIALIST_DEPTH
  const maxConcurrent = options.maxConcurrent ?? MAX_SPECIALIST_CONCURRENT
  const maxInvocations = options.maxInvocations ?? MAX_SPECIALIST_INVOCATIONS
  const timeoutMs = options.timeoutMs ?? SPECIALIST_TIMEOUT_MS

  let invocationCount = 0
  let activeCount = 0
  let maxDepthReached = 0

  const budget: SpecialistBudget = {
    maxDepth,
    maxConcurrent,
    maxInvocations,
    timeoutMs,
    get invocationCount() {
      return invocationCount
    },
    get activeCount() {
      return activeCount
    },
    get maxDepthReached() {
      return maxDepthReached
    },
    tryEnter(parentDepth = 0): SpecialistBudgetEnterResult {
      if (invocationCount >= maxInvocations) {
        return {
          ok: false,
          reason: `Specialist invocation budget exhausted (${maxInvocations} per turn)`,
        }
      }
      if (activeCount >= maxConcurrent) {
        return {
          ok: false,
          reason: `Specialist concurrency limit reached (${maxConcurrent} concurrent)`,
        }
      }
      const nextDepth = parentDepth + 1
      if (nextDepth > maxDepth) {
        return {
          ok: false,
          reason: `Specialist nesting depth exceeded (max ${maxDepth})`,
        }
      }

      invocationCount += 1
      activeCount += 1
      if (nextDepth > maxDepthReached) {
        maxDepthReached = nextDepth
      }

      let released = false
      return {
        ok: true,
        depth: nextDepth,
        release: () => {
          if (released) return
          released = true
          activeCount = Math.max(0, activeCount - 1)
        },
      }
    },
    snapshot() {
      return {
        invocationCount,
        activeCount,
        maxDepthReached,
      }
    },
  }

  return budget
}

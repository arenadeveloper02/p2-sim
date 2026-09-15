/**
 * Lightweight turn timing for Arena Copilot latency diagnosis.
 * Marks are offsets from turn start; pair diffs show where wall time went.
 */
export interface LocalCopilotTurnTiming {
  readonly startedAt: number
  mark: (name: string) => void
  /** Milliseconds from turn start to a mark (or now). */
  elapsed: (name?: string) => number
  /** Milliseconds between two marks (or from mark → now). */
  since: (from: string, to?: string) => number | null
  /** All marks as `{ name: msFromStart }`. */
  snapshot: () => Record<string, number>
}

/**
 * Creates a turn timer. Call `mark` at each milestone, then log `snapshot()`.
 */
export function createLocalCopilotTurnTiming(startedAt = Date.now()): LocalCopilotTurnTiming {
  const marks = new Map<string, number>([['start', startedAt]])

  return {
    startedAt,
    mark(name) {
      marks.set(name, Date.now())
    },
    elapsed(name) {
      const at = name ? marks.get(name) : Date.now()
      return (at ?? Date.now()) - startedAt
    },
    since(from, to) {
      const a = marks.get(from)
      if (a === undefined) return null
      const b = to ? marks.get(to) : Date.now()
      if (b === undefined) return null
      return b - a
    },
    snapshot() {
      const out: Record<string, number> = {}
      for (const [name, at] of marks) {
        out[name] = at - startedAt
      }
      return out
    },
  }
}

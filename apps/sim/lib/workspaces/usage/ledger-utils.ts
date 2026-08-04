/** Client-safe ledger formatting and ranking helpers (no DB imports). */

export function parseDecimal(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function parseIntMetric(value: string | number | bigint | null | undefined): number {
  if (typeof value === 'bigint') {
    if (value <= 0n) return 0
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) return Number.MAX_SAFE_INTEGER
    return Number(value)
  }
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
  if (value == null || value === '') return 0
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(Math.trunc(parsed), Number.MAX_SAFE_INTEGER))
}

/**
 * Coerces a bucket key (model, vendor, provider, …) to a non-empty string.
 * Null/blank keys must not reach `z.string()` response contracts.
 */
export function normalizeBucketKey(value: string | null | undefined, fallback = 'unknown'): string {
  const trimmed = value?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : fallback
}

/** Sorts cost buckets highest billable cost first. */
export function sortByBillableCostDesc<T extends { billableCost: number }>(
  rows: readonly T[]
): T[] {
  return [...rows].sort((a, b) => b.billableCost - a.billableCost)
}

/** Average billable credits per workflow run; zero when inputs are non-positive. */
export function averageBillableCostPerRun(billableCost: number, executionCount: number): number {
  if (executionCount <= 0 || billableCost <= 0) return 0
  return billableCost / executionCount
}

/** Sorts workflow rows by highest average billable cost per run. */
export function sortByAverageBillableCostPerRunDesc<
  T extends { billableCost: number; executionCount: number },
>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      averageBillableCostPerRun(b.billableCost, b.executionCount) -
      averageBillableCostPerRun(a.billableCost, a.executionCount)
  )
}

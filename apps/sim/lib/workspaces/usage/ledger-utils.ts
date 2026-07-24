/** Client-safe ledger formatting and ranking helpers (no DB imports). */

export function parseDecimal(value: string | null | undefined): number {
  if (!value) return 0
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function parseIntMetric(value: string | number | null | undefined): number {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
  if (!value) return 0
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(Math.trunc(parsed), Number.MAX_SAFE_INTEGER))
}

/** Sorts cost buckets highest billable cost first. */
export function sortByBillableCostDesc<T extends { billableCost: number }>(
  rows: readonly T[]
): T[] {
  return [...rows].sort((a, b) => b.billableCost - a.billableCost)
}

/** Average billable credits per workflow run; zero when inputs are non-positive. */
export function averageBillableCostPerRun(
  billableCost: number,
  executionCount: number
): number {
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

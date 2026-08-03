import type { MemberCreditUsageRow } from '@/lib/api/contracts/billing-credit-usage'

/** Derive two-letter initials from a display name. */
export function getMemberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase()
}

/** Clamp a percentage between 0 and 100 for progress bars. */
export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

export interface OrgMemberCreditDisplay {
  totalCredits: number | 'unlimited'
  allocatedCredits: number | null
  usedCredits: number
  remainingCredits: number | 'unlimited'
  progressNumerator: number
  progressDenominator: number
  progressPercent: number
}

/**
 * Derive org-member billing card values: org pool total/remaining plus optional
 * per-member allocation. Remaining matches enforcement — capped members cannot
 * exceed their allocation or the shared org pool, whichever is tighter.
 */
export function resolveOrgMemberCreditDisplay(params: {
  orgPool: { totalCredits: number; usedCredits: number; isUnlimited: boolean }
  allocatedCredits: number | null
  memberUsedCredits: number
}): OrgMemberCreditDisplay {
  const { orgPool, allocatedCredits, memberUsedCredits } = params

  const totalCredits: number | 'unlimited' = orgPool.isUnlimited
    ? 'unlimited'
    : orgPool.totalCredits

  const orgRemaining = orgPool.isUnlimited
    ? Number.POSITIVE_INFINITY
    : Math.max(0, orgPool.totalCredits - orgPool.usedCredits)

  const memberRemaining =
    allocatedCredits != null ? Math.max(0, allocatedCredits - memberUsedCredits) : null

  let remainingCredits: number | 'unlimited'
  if (orgPool.isUnlimited) {
    remainingCredits = memberRemaining != null ? memberRemaining : ('unlimited' as const)
  } else if (memberRemaining != null) {
    remainingCredits = Math.min(memberRemaining, orgRemaining)
  } else {
    remainingCredits = orgRemaining
  }

  const progressNumerator = allocatedCredits != null ? memberUsedCredits : orgPool.usedCredits
  const progressDenominator =
    allocatedCredits != null ? allocatedCredits : orgPool.isUnlimited ? 0 : orgPool.totalCredits
  const progressPercent =
    progressDenominator > 0 ? clampPercent((progressNumerator / progressDenominator) * 100) : 0

  return {
    totalCredits,
    allocatedCredits,
    usedCredits: memberUsedCredits,
    remainingCredits,
    progressNumerator,
    progressDenominator,
    progressPercent,
  }
}

export interface OrgPoolBarSegments {
  /** Org pool remaining shown as the hero number (not allocation-capped). */
  poolRemainingCredits: number | 'unlimited'
  poolTotalCredits: number | 'unlimited'
  usedByOrgCredits: number
  usedByYouCredits: number
  usedByOthersCredits: number
  youPercent: number
  othersPercent: number
  remainingPercent: number
}

/**
 * Segment percentages for the You / Organization / Remaining pool bar.
 * "Organization" on the bar is other members' usage (org used − you).
 */
export function resolveOrgPoolBarSegments(params: {
  orgPool: { totalCredits: number; usedCredits: number; isUnlimited: boolean }
  memberUsedCredits: number
}): OrgPoolBarSegments {
  const { orgPool, memberUsedCredits } = params
  const usedByYouCredits = Math.max(0, memberUsedCredits)
  const usedByOrgCredits = Math.max(0, orgPool.usedCredits)
  const usedByOthersCredits = Math.max(0, usedByOrgCredits - usedByYouCredits)

  if (orgPool.isUnlimited || orgPool.totalCredits <= 0) {
    return {
      poolRemainingCredits: 'unlimited',
      poolTotalCredits: 'unlimited',
      usedByOrgCredits,
      usedByYouCredits,
      usedByOthersCredits,
      youPercent: 0,
      othersPercent: 0,
      remainingPercent: 100,
    }
  }

  const poolRemainingCredits = Math.max(0, orgPool.totalCredits - usedByOrgCredits)
  const youPercent = clampPercent((usedByYouCredits / orgPool.totalCredits) * 100)
  const othersPercent = clampPercent((usedByOthersCredits / orgPool.totalCredits) * 100)
  const remainingPercent = clampPercent(100 - youPercent - othersPercent)

  return {
    poolRemainingCredits,
    poolTotalCredits: orgPool.totalCredits,
    usedByOrgCredits,
    usedByYouCredits,
    usedByOthersCredits,
    youPercent,
    othersPercent,
    remainingPercent,
  }
}

/** Format a credit count for display. */
export function formatCreditCount(credits: number): string {
  return credits.toLocaleString()
}

/** Format a share of the pool as `X.X%`. */
export function formatSharePercent(part: number, whole: number): string {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return '0.0%'
  return `${clampPercent((part / whole) * 100).toFixed(1)}%`
}

/** Download member usage rows as a CSV file. */
export function exportMemberUsageCsv(members: MemberCreditUsageRow[]): void {
  const headers = ['Name', 'Email', 'Mothership credits', 'Workflow run credits', 'Total credits']
  const rows = members.map((member) => [
    member.userName,
    member.userEmail,
    String(member.mothershipCredits),
    String(member.workflowCredits),
    String(member.totalCredits),
  ])

  const csv = [headers, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
    .join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'organization-credit-usage.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

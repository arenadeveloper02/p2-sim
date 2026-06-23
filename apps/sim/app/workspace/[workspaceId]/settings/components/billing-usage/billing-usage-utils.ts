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

/** Format a credit count for display. */
export function formatCreditCount(credits: number): string {
  return credits.toLocaleString()
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

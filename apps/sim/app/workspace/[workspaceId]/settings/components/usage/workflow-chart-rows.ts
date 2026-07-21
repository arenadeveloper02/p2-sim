import type { CostShareBarRow } from '@/app/workspace/[workspaceId]/settings/components/usage/components/cost-share-bars'
import { formatBillableWithCredits } from '@/app/workspace/[workspaceId]/settings/components/usage/format'
import { averageBillableCostPerRun } from '@/lib/workspaces/usage/ledger-utils'

interface WorkflowUsageRow {
  workflowId: string | null
  workflowName: string | null
  executionCount: number
  billableCost: number
  workspaceId?: string
  workspaceName?: string | null
}

function workflowRowId(row: WorkflowUsageRow): string {
  const workflowKey = row.workflowId ?? row.workflowName ?? 'unknown'
  return row.workspaceId ? `${row.workspaceId}-${workflowKey}` : workflowKey
}

function workflowRowSecondary(row: WorkflowUsageRow): string {
  const parts = [
    row.workspaceName,
    `${row.executionCount.toLocaleString()} runs`,
  ].filter(Boolean)
  return parts.join(' · ')
}

/**
 * Bar chart rows ranked by total workflow billable cost (descending via {@link CostShareBars}).
 */
export function buildWorkflowTotalCostChartRows(
  rows: WorkflowUsageRow[],
  getLogsHref: (workflowId: string, workspaceId?: string) => string | undefined
): CostShareBarRow[] {
  return rows.map((row) => ({
    id: workflowRowId(row),
    label: row.workflowName ?? row.workflowId ?? 'Unknown workflow',
    billableCost: row.billableCost,
    secondary: workflowRowSecondary(row),
    href: row.workflowId ? getLogsHref(row.workflowId, row.workspaceId) : undefined,
  }))
}

/**
 * Bar chart rows ranked by average billable cost per run (descending via {@link CostShareBars}).
 */
export function buildWorkflowAverageCostChartRows(
  rows: WorkflowUsageRow[],
  getLogsHref: (workflowId: string, workspaceId?: string) => string | undefined
): CostShareBarRow[] {
  return rows
    .filter((row) => row.executionCount > 0 && row.billableCost > 0)
    .map((row) => ({
      id: `${workflowRowId(row)}-avg`,
      label: row.workflowName ?? row.workflowId ?? 'Unknown workflow',
      billableCost: averageBillableCostPerRun(row.billableCost, row.executionCount),
      secondary: `${row.executionCount.toLocaleString()} runs · ${formatBillableWithCredits(row.billableCost)} total`,
      href: row.workflowId ? getLogsHref(row.workflowId, row.workspaceId) : undefined,
    }))
}

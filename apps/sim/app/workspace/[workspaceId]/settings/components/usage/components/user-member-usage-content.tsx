'use client'

import type { ReactNode } from 'react'
import { useMemo } from 'react'
import type { UserUsageAnalytics } from '@/lib/api/contracts/user-usage'
import { dollarsToCredits } from '@/lib/billing/credits/conversion'
import { averageBillableCostPerRun } from '@/lib/workspaces/usage/ledger-utils'
import { formatCreditCount } from '@/app/workspace/[workspaceId]/settings/components/billing-usage/billing-usage-utils'
import {
  UsageRankCreditsCell,
  UsageRankTable,
} from '@/app/workspace/[workspaceId]/settings/components/usage/components/usage-rank-table'
import {
  aggregateUsageToolsByFamily,
  formatUsageToolFamilyLabel,
} from '@/app/workspace/[workspaceId]/settings/components/usage/format'

interface UserMemberUsageContentProps {
  data: UserUsageAnalytics
  workspaceFilterLabel: string
  periodStatusLabel: string
  /** Period + workspace filter controls rendered under Activity detail. */
  filters: ReactNode
}

/**
 * Member Usage activity detail matching the FOR USERS screenshot:
 * filters, status line, By Workflow / By Tools (no By User).
 */
export function UserMemberUsageContent({
  data,
  workspaceFilterLabel,
  periodStatusLabel,
  filters,
}: UserMemberUsageContentProps) {
  const workflowRows = useMemo(() => data.workflow.byWorkflow, [data.workflow.byWorkflow])
  const toolRows = useMemo(() => aggregateUsageToolsByFamily(data.byTool), [data.byTool])

  return (
    <div className='flex flex-col gap-6'>
      <div className='flex flex-col gap-3'>
        <h2 className='font-medium text-[var(--text-primary)] text-base'>Activity detail</h2>

        <div className='flex flex-wrap items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2.5'>
          {filters}
        </div>

        <p className='text-[var(--text-muted)] text-small'>
          Showing <span className='font-medium text-[var(--text-secondary)]'>all sources</span> for
          the <span className='font-medium text-[var(--text-secondary)]'>{periodStatusLabel}</span>{' '}
          in{' '}
          <span className='font-medium text-[var(--text-secondary)]'>{workspaceFilterLabel}</span>.
        </p>
      </div>

      <UsageRankTable
        rows={workflowRows}
        getRowKey={(row, index) =>
          `${row.workspaceId}:${row.workflowId ?? `workflow-${index}`}`
        }
        getBillableCost={(row) => row.billableCost}
        emptyMessage='No workflow usage in this period.'
        columns={[
          {
            key: 'name',
            header: 'By Workflow',
            render: (row) => (
              <span className='font-medium'>
                {row.workflowName?.trim() || row.workflowId || 'Untitled workflow'}
              </span>
            ),
          },
          {
            key: 'runs',
            header: 'Runs',
            align: 'right',
            render: (row) => row.executionCount.toLocaleString(),
          },
          {
            key: 'avg',
            header: 'Avg credits/run',
            align: 'right',
            render: (row) =>
              formatCreditCount(
                dollarsToCredits(averageBillableCostPerRun(row.billableCost, row.executionCount))
              ),
          },
          {
            key: 'credits',
            header: 'Credits',
            align: 'right',
            render: (row) => <UsageRankCreditsCell billableCost={row.billableCost} />,
          },
        ]}
      />

      <UsageRankTable
        rows={toolRows}
        getRowKey={(row) => row.toolId}
        getBillableCost={(row) => row.billableCost}
        getRankValue={(row) => (row.billableCost > 0 ? row.billableCost : row.count)}
        emptyMessage='No hosted tool usage in this period.'
        columns={[
          {
            key: 'tool',
            header: 'By Tools',
            render: (row) => (
              <span className='font-medium'>{formatUsageToolFamilyLabel(row.toolId)}</span>
            ),
          },
          {
            key: 'runs',
            header: 'Runs',
            align: 'right',
            render: (row) => row.count.toLocaleString(),
          },
          {
            key: 'credits',
            header: 'Credits',
            align: 'right',
            render: (row) => <UsageRankCreditsCell billableCost={row.billableCost} />,
          },
        ]}
      />
    </div>
  )
}

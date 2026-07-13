'use client'

import type { WorkspaceUsageAnalytics } from '@/lib/api/contracts/workspace-usage'
import { formatBillableWithCredits } from '@/app/workspace/[workspaceId]/settings/components/usage/format'

interface AttributionBannerProps {
  data: {
    attribution: WorkspaceUsageAnalytics['attribution']
  }
}

/** Warns when ledger rows lack chat or execution join keys. */
export function AttributionBanner({ data }: AttributionBannerProps) {
  const { missingChatId, missingExecutionId } = data.attribution
  const hasMissingChat =
    missingChatId.billableCost > 0 || missingChatId.count > 0 || missingChatId.rawCost > 0
  const hasMissingExecution =
    missingExecutionId.billableCost > 0 ||
    missingExecutionId.count > 0 ||
    missingExecutionId.rawCost > 0

  if (!hasMissingChat && !hasMissingExecution) return null

  return (
    <div className='rounded-lg border border-[var(--border)] bg-[var(--surface-3)] px-4 py-3'>
      <p className='font-medium text-[var(--text-primary)] text-small'>Unattributed usage</p>
      <p className='mt-1 text-[var(--text-secondary)] text-small'>
        Some ledger rows are missing join keys and cannot be tied to a chat or execution.
      </p>
      <div className='mt-3 flex flex-col gap-2 sm:flex-row sm:gap-6'>
        {hasMissingChat && (
          <div className='text-small'>
            <span className='text-[var(--text-muted)]'>Missing chat ID: </span>
            <span className='text-[var(--text-primary)] tabular-nums'>
              {formatBillableWithCredits(missingChatId.billableCost)}
            </span>
            <span className='ml-1 text-[var(--text-muted)]'>({missingChatId.count} rows)</span>
          </div>
        )}
        {hasMissingExecution && (
          <div className='text-small'>
            <span className='text-[var(--text-muted)]'>Missing execution ID: </span>
            <span className='text-[var(--text-primary)] tabular-nums'>
              {formatBillableWithCredits(missingExecutionId.billableCost)}
            </span>
            <span className='ml-1 text-[var(--text-muted)]'>
              ({missingExecutionId.count} rows)
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

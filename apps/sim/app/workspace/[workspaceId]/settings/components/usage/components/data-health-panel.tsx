'use client'

import { Badge } from '@/components/emcn'
import { cn } from '@/lib/core/utils/cn'
import type { WorkspaceUsageAnalytics } from '@/lib/api/contracts/workspace-usage'
import { AttributionBanner } from '@/app/workspace/[workspaceId]/settings/components/usage/components/attribution-banner'

interface DataHealthPanelProps {
  data: {
    dataHealth: WorkspaceUsageAnalytics['dataHealth']
    attribution?: WorkspaceUsageAnalytics['attribution']
  }
}

/**
 * Surfaces ledger reconciliation warnings and limited-attribution notices.
 */
export function DataHealthPanel({ data }: DataHealthPanelProps) {
  const { dataHealth } = data
  const hasWarnings = dataHealth.warnings.length > 0

  return (
    <div className='flex flex-col gap-3'>
      {dataHealth.limitedAttribution && (
        <div className='rounded-lg border border-[var(--border)] bg-[var(--surface-3)] px-4 py-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <Badge variant='gray-secondary' size='sm'>
              Limited attribution
            </Badge>
            <p className='text-[var(--text-secondary)] text-small'>
              More than 10% of ledger rows in this period lack actor fields — common for
              pre-cutover data.
            </p>
          </div>
        </div>
      )}

      {hasWarnings && (
        <div className='rounded-lg border border-[var(--border)] bg-[var(--surface-3)] px-4 py-3'>
          <p className='font-medium text-[var(--text-primary)] text-small'>Data health</p>
          <ul className='mt-3 flex flex-col gap-2'>
            {dataHealth.warnings.map((warning) => (
              <li
                key={warning.id}
                className='flex flex-wrap items-start justify-between gap-2 text-small'
              >
                <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <Badge
                      variant={warning.severity === 'error' ? 'red' : 'gray-secondary'}
                      size='sm'
                    >
                      {warning.severity === 'error' ? 'Error' : 'Warning'}
                    </Badge>
                    <span className={cn('text-[var(--text-primary)]')}>{warning.label}</span>
                  </div>
                  {warning.detail && (
                    <span className='text-[var(--text-muted)] text-xs'>{warning.detail}</span>
                  )}
                </div>
                <span className='shrink-0 tabular-nums text-[var(--text-secondary)]'>
                  {warning.count.toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {data.attribution && <AttributionBanner data={{ attribution: data.attribution }} />}
    </div>
  )
}

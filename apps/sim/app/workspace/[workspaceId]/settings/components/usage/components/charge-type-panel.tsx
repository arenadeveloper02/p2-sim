'use client'

import { useMemo } from 'react'
import type { WorkspaceUsageAnalytics } from '@/lib/api/contracts/workspace-usage'
import {
  CostBreakdownTable,
  CostCell,
} from '@/app/workspace/[workspaceId]/settings/components/usage/components/cost-breakdown-table'
import { CostShareBars } from '@/app/workspace/[workspaceId]/settings/components/usage/components/cost-share-bars'
import {
  formatChargeTypeLabel,
  formatDollarAmount,
} from '@/app/workspace/[workspaceId]/settings/components/usage/format'
import { SettingsSection } from '@/app/workspace/[workspaceId]/settings/components/settings-section/settings-section'

interface ChargeTypePanelProps {
  byChargeType: WorkspaceUsageAnalytics['byChargeType']
  totalBillableCost: number
}

/**
 * Splits total billable cost into base run fee, provider, tool, and Cost-block buckets.
 */
export function ChargeTypePanel({ byChargeType, totalBillableCost }: ChargeTypePanelProps) {
  const chartRows = useMemo(
    () =>
      byChargeType.map((row) => ({
        id: row.chargeType,
        label: formatChargeTypeLabel(row.chargeType),
        billableCost: row.billableCost,
        secondary:
          totalBillableCost > 0
            ? `${((row.billableCost / totalBillableCost) * 100).toFixed(0)}%`
            : undefined,
      })),
    [byChargeType, totalBillableCost]
  )

  if (byChargeType.length === 0) return null

  return (
    <SettingsSection label='Cost composition'>
      <p className='mb-4 text-[var(--text-secondary)] text-small'>
        How the {formatDollarAmount(totalBillableCost)} total breaks down — base run fee, provider
        model spend, hosted tools, and Cost-block pass-through.
      </p>
      <div className='mb-6'>
        <CostShareBars rows={chartRows} emptyMessage='No charge-type data for this period.' />
      </div>
      <CostBreakdownTable
        rows={byChargeType}
        getRowKey={(row) => row.chargeType}
        columns={[
          {
            key: 'type',
            header: 'Charge type',
            render: (row) => formatChargeTypeLabel(row.chargeType),
          },
          {
            key: 'count',
            header: 'Entries',
            align: 'right',
            render: (row) => row.count.toLocaleString(),
          },
          {
            key: 'share',
            header: 'Share',
            align: 'right',
            render: (row) =>
              totalBillableCost > 0
                ? `${((row.billableCost / totalBillableCost) * 100).toFixed(1)}%`
                : '—',
          },
          {
            key: 'cost',
            header: 'Billable',
            align: 'right',
            render: (row) => <CostCell billableCost={row.billableCost} rawCost={row.rawCost} />,
          },
        ]}
      />
    </SettingsSection>
  )
}

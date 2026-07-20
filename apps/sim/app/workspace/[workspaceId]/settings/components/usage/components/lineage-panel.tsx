'use client'

import { ChipLink } from '@/components/emcn'
import type { WorkspaceUsageAnalytics } from '@/lib/api/contracts/workspace-usage'
import {
  CostBreakdownTable,
  CostCell,
} from '@/app/workspace/[workspaceId]/settings/components/usage/components/cost-breakdown-table'
import {
  formatActorType,
  formatBillableWithCredits,
} from '@/app/workspace/[workspaceId]/settings/components/usage/format'
import { SettingsSection } from '@/app/workspace/[workspaceId]/settings/components/settings-section/settings-section'

interface LineagePanelProps {
  workspaceId: string
  lineage: WorkspaceUsageAnalytics['lineage']
  rootExecutionId: string | null
  userNameById: Map<string, string>
  onSelectRoot: (rootExecutionId: string) => void
  onClearDrillDown: () => void
}

/**
 * Execution lineage roots and optional drill-down for a selected root run.
 */
export function LineagePanel({
  workspaceId,
  lineage,
  rootExecutionId,
  userNameById,
  onSelectRoot,
  onClearDrillDown,
}: LineagePanelProps) {
  const drillDown = lineage.drillDown

  if (drillDown) {
    return (
      <SettingsSection label='Execution lineage'>
        <div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
          <div>
            <p className='text-[var(--text-secondary)] text-small'>
              Root run{' '}
              <span className='font-mono text-[var(--text-primary)]'>
                {drillDown.rootExecutionId.slice(0, 8)}…
              </span>
            </p>
            <p className='mt-0.5 text-[var(--text-muted)] text-xs'>
              Inclusive credits {formatBillableWithCredits(drillDown.inclusiveBillableCost)} ·{' '}
              {drillDown.executions.length.toLocaleString()} runs in tree
            </p>
          </div>
          <button
            type='button'
            onClick={onClearDrillDown}
            className='text-[var(--text-secondary)] text-small underline-offset-2 hover-hover:text-[var(--text-primary)] hover-hover:underline'
          >
            Back to roots
          </button>
        </div>
        <CostBreakdownTable
          rows={drillDown.executions}
          getRowKey={(row) => row.executionId}
          emptyMessage='No executions in this lineage tree.'
          columns={[
            {
              key: 'workflow',
              header: 'Workflow',
              render: (row) => {
                const label = row.workflowName ?? row.workflowId ?? 'Unknown workflow'
                if (row.workflowId) {
                  return (
                    <ChipLink
                      href={`/workspace/${workspaceId}/logs?workflowIds=${row.workflowId}`}
                      target='_blank'
                      rel='noopener noreferrer'
                    >
                      {label}
                    </ChipLink>
                  )
                }
                return label
              },
            },
            {
              key: 'trigger',
              header: 'Trigger',
              render: (row) => row.trigger || 'Unknown',
            },
            {
              key: 'actor',
              header: 'Actor',
              render: (row) => {
                const actorLabel = row.actorUserId
                  ? (userNameById.get(row.actorUserId) ?? row.actorUserId)
                  : formatActorType(row.actorType)
                return (
                  <span>
                    {actorLabel}
                    {row.actorType && (
                      <span className='ml-1 text-[var(--text-muted)]'>
                        ({formatActorType(row.actorType)})
                      </span>
                    )}
                  </span>
                )
              },
            },
            {
              key: 'started',
              header: 'Started',
              render: (row) => new Date(row.startedAt).toLocaleString(),
            },
            {
              key: 'cost',
              header: 'Credits',
              align: 'right',
              render: (row) => (
                <CostCell billableCost={row.billableCost} rawCost={row.rawCost} />
              ),
            },
            {
              key: 'execution',
              header: '',
              align: 'right',
              render: (row) => (
                <ChipLink
                  href={`/workspace/${workspaceId}/logs?search=${row.executionId}`}
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  View
                </ChipLink>
              ),
            },
          ]}
        />
      </SettingsSection>
    )
  }

  if (lineage.roots.length === 0) return null

  return (
    <SettingsSection label='Execution lineage'>
      <p className='mb-4 text-[var(--text-secondary)] text-small'>
        Top lineage trees by inclusive workflow cost. Select a root to drill into child runs.
      </p>
      <CostBreakdownTable
        rows={lineage.roots}
        getRowKey={(row) => row.rootExecutionId}
        emptyMessage='No lineage roots in this period.'
        columns={[
          {
            key: 'root',
            header: 'Root execution',
            render: (row) => (
              <div className='flex items-center gap-2'>
                <button
                  type='button'
                  onClick={() => onSelectRoot(row.rootExecutionId)}
                  className='font-mono text-[var(--text-primary)] text-small underline-offset-2 hover-hover:underline'
                >
                  {row.rootExecutionId.slice(0, 12)}…
                </button>
                <ChipLink
                  href={`/workspace/${workspaceId}/logs?search=${row.rootExecutionId}`}
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  View
                </ChipLink>
              </div>
            ),
          },
          {
            key: 'runs',
            header: 'Runs',
            align: 'right',
            render: (row) => row.executionCount.toLocaleString(),
          },
          {
            key: 'cost',
            header: 'Inclusive credits',
            align: 'right',
            render: (row) => (
              <CostCell
                billableCost={row.inclusiveBillableCost}
                rawCost={row.inclusiveRawCost}
              />
            ),
          },
          {
            key: 'drill',
            header: '',
            align: 'right',
            render: (row) => (
              <button
                type='button'
                onClick={() => onSelectRoot(row.rootExecutionId)}
                className='text-[var(--text-secondary)] text-small underline-offset-2 hover-hover:text-[var(--text-primary)] hover-hover:underline'
              >
                Drill down
              </button>
            ),
          },
        ]}
      />
      {rootExecutionId && !drillDown && (
        <p className='mt-3 text-[var(--text-muted)] text-small'>
          Loading lineage for {rootExecutionId.slice(0, 12)}…
        </p>
      )}
    </SettingsSection>
  )
}

'use client'

import { useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useQueryStates } from 'nuqs'
import {
  Badge,
  ButtonGroup,
  ButtonGroupItem,
  ChipLink,
  Loader,
  RefreshCw,
  Skeleton,
} from '@/components/emcn'
import { cn } from '@/lib/core/utils/cn'
import type { WorkspaceUsageAnalytics } from '@/lib/api/contracts/workspace-usage'
import {
  CostBreakdownTable,
  CostCell,
} from '@/app/workspace/[workspaceId]/settings/components/usage/components/cost-breakdown-table'
import { DataHealthPanel } from '@/app/workspace/[workspaceId]/settings/components/usage/components/data-health-panel'
import { LineagePanel } from '@/app/workspace/[workspaceId]/settings/components/usage/components/lineage-panel'
import { UsageTimeSeriesChart } from '@/app/workspace/[workspaceId]/settings/components/usage/components/usage-time-series-chart'
import {
  formatActorType,
  formatBillableWithCredits,
  formatDollarAmount,
  formatPeriodLabel,
  formatSourceLabel,
  formatTokenCount,
  formatUsageMetricsSummary,
  MOTHERSHIP_USAGE_SOURCES,
} from '@/app/workspace/[workspaceId]/settings/components/usage/format'
import {
  type UsagePeriod,
  type UsageTab,
  USAGE_PERIODS,
  USAGE_TABS,
  usageParsers,
  usageUrlKeys,
} from '@/app/workspace/[workspaceId]/settings/components/usage/search-params'
import { SettingsSection } from '@/app/workspace/[workspaceId]/settings/components/settings-section/settings-section'
import { useWorkspaceUsageAnalytics } from '@/hooks/queries/workspace-usage'
import { useWorkspacePermissionsQuery } from '@/hooks/queries/workspace'

const TAB_LABELS: Record<UsageTab, string> = {
  all: 'All sources',
  workflow: 'Workflows',
  mothership: 'Mothership',
}

interface SummaryCardProps {
  label: string
  value: string
  hint?: string
  isLoading?: boolean
}

function SummaryCard({ label, value, hint, isLoading }: SummaryCardProps) {
  return (
    <div className='flex min-w-0 flex-1 flex-col gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-4 py-3'>
      <span className='text-[var(--text-muted)] text-small'>{label}</span>
      {isLoading ? (
        <Skeleton className='h-7 w-24' />
      ) : (
        <span className='font-medium text-[var(--text-primary)] text-lg tabular-nums'>{value}</span>
      )}
      {hint && !isLoading && <span className='text-[var(--text-muted)] text-xs'>{hint}</span>}
    </div>
  )
}

interface UsageDashboardContentProps {
  workspaceId: string
  data: WorkspaceUsageAnalytics
  tab: UsageTab
  userNameById: Map<string, string>
  rootExecutionId: string | null
  onSelectRoot: (rootExecutionId: string) => void
  onClearDrillDown: () => void
}

function UsageDashboardContent({
  workspaceId,
  data,
  tab,
  userNameById,
  rootExecutionId,
  onSelectRoot,
  onClearDrillDown,
}: UsageDashboardContentProps) {
  const showWorkflow = tab === 'all' || tab === 'workflow'
  const showMothership = tab === 'all' || tab === 'mothership'

  return (
    <div className='flex flex-col gap-8'>
      <DataHealthPanel data={data} />

      {data.timeSeries.length > 0 && (
        <SettingsSection label='Trends'>
          <UsageTimeSeriesChart timeSeries={data.timeSeries} />
        </SettingsSection>
      )}

      {(tab === 'all' || tab === 'workflow') && data.bySource.length > 0 && (
        <SettingsSection label='By source'>
          <CostBreakdownTable
            rows={data.bySource}
            getRowKey={(row) => row.source}
            columns={[
              {
                key: 'source',
                header: 'Source',
                render: (row) => formatSourceLabel(row.source),
              },
              {
                key: 'count',
                header: 'Entries',
                align: 'right',
                render: (row) => row.count.toLocaleString(),
              },
              {
                key: 'tokens',
                header: 'Tokens',
                align: 'right',
                render: (row) => formatTokenCount(row.usage.totalTokens),
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
      )}

      {showWorkflow && (
        <SettingsSection label='Workflow executions'>
          <div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
            <p className='text-[var(--text-secondary)] text-small'>
              {data.workflow.executions.total.toLocaleString()} executions ·{' '}
              {data.workflow.executions.withProjectedCost.toLocaleString()} with projected cost
            </p>
            <ChipLink href={`/workspace/${workspaceId}/logs`}>View execution logs</ChipLink>
          </div>
          {data.workflow.byWorkflow.length > 0 && (
            <CostBreakdownTable
              rows={data.workflow.byWorkflow}
              getRowKey={(row) => row.workflowId ?? `unknown-${row.workflowName}`}
              emptyMessage='No workflow executions in this period.'
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
                        >
                          {label}
                        </ChipLink>
                      )
                    }
                    return label
                  },
                },
                {
                  key: 'executions',
                  header: 'Runs',
                  align: 'right',
                  render: (row) => row.executionCount.toLocaleString(),
                },
                {
                  key: 'cost',
                  header: 'Billable',
                  align: 'right',
                  render: (row) => (
                    <CostCell billableCost={row.billableCost} rawCost={row.rawCost} />
                  ),
                },
              ]}
            />
          )}
          {data.workflow.byTrigger.length > 0 && (
            <div className='mt-6'>
              <p className='mb-2 text-[var(--text-muted)] text-small'>By trigger</p>
              <CostBreakdownTable
                rows={data.workflow.byTrigger}
                getRowKey={(row) => row.trigger}
                columns={[
                  {
                    key: 'trigger',
                    header: 'Trigger',
                    render: (row) => row.trigger || 'Unknown',
                  },
                  {
                    key: 'executions',
                    header: 'Runs',
                    align: 'right',
                    render: (row) => row.executionCount.toLocaleString(),
                  },
                  {
                    key: 'cost',
                    header: 'Billable',
                    align: 'right',
                    render: (row) => (
                      <CostCell billableCost={row.billableCost} rawCost={row.rawCost} />
                    ),
                  },
                ]}
              />
            </div>
          )}
        </SettingsSection>
      )}

      {showWorkflow && (
        <LineagePanel
          workspaceId={workspaceId}
          lineage={data.lineage}
          rootExecutionId={rootExecutionId}
          userNameById={userNameById}
          onSelectRoot={onSelectRoot}
          onClearDrillDown={onClearDrillDown}
        />
      )}

      {showMothership && (
        <SettingsSection label='Mothership & copilot'>
          <div className='mb-4 flex flex-wrap items-center justify-between gap-2'>
            <p className='text-[var(--text-secondary)] text-small'>
              {data.copilot.chats.total.toLocaleString()} chats ·{' '}
              {data.copilot.chats.withLedgerCost.toLocaleString()} with ledger cost ·{' '}
              {data.copilot.runs.total.toLocaleString()} runs
            </p>
            <ChipLink href={`/workspace/${workspaceId}/home`}>Open mothership</ChipLink>
          </div>
          {data.copilot.triggeredWorkflows.executionCount > 0 && (
            <div className='mb-6 rounded-lg border border-[var(--border)] bg-[var(--surface-3)] px-4 py-3'>
              <p className='font-medium text-[var(--text-primary)] text-small'>
                Workflows triggered by copilot
              </p>
              <p className='mt-1 text-[var(--text-secondary)] text-small'>
                {data.copilot.triggeredWorkflows.executionCount.toLocaleString()} child runs ·{' '}
                {formatBillableWithCredits(data.copilot.triggeredWorkflows.billableCost)} inclusive
              </p>
              <p className='mt-1 text-[var(--text-muted)] text-xs'>
                Rolled up via triggering chat — excluded from mothership headline totals to avoid
                double counting.
              </p>
              {data.copilot.triggeredWorkflows.byChat.length > 0 && (
                <div className='mt-4'>
                  <CostBreakdownTable
                    rows={data.copilot.triggeredWorkflows.byChat}
                    getRowKey={(row) => row.triggeringChatId}
                    columns={[
                      {
                        key: 'chat',
                        header: 'Triggering chat',
                        render: (row) => (
                          <span className='font-mono text-small'>
                            {row.triggeringChatId.slice(0, 12)}…
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
                        key: 'cost',
                        header: 'Billable',
                        align: 'right',
                        render: (row) => (
                          <CostCell billableCost={row.billableCost} rawCost={row.rawCost} />
                        ),
                      },
                    ]}
                  />
                </div>
              )}
            </div>
          )}
          {data.copilot.byChatType.length > 0 && (
            <CostBreakdownTable
              rows={data.copilot.byChatType}
              getRowKey={(row) => row.chatType}
              columns={[
                {
                  key: 'type',
                  header: 'Chat type',
                  render: (row) => <span className='capitalize'>{row.chatType}</span>,
                },
                {
                  key: 'chats',
                  header: 'Chats',
                  align: 'right',
                  render: (row) => row.chatCount.toLocaleString(),
                },
                {
                  key: 'runs',
                  header: 'Runs',
                  align: 'right',
                  render: (row) => row.runCount.toLocaleString(),
                },
                {
                  key: 'cost',
                  header: 'Billable',
                  align: 'right',
                  render: (row) => (
                    <CostCell billableCost={row.billableCost} rawCost={row.rawCost} />
                  ),
                },
              ]}
            />
          )}
          {data.copilot.byModel.length > 0 && (
            <div className='mt-6'>
              <p className='mb-2 text-[var(--text-muted)] text-small'>By model</p>
              <CostBreakdownTable
                rows={data.copilot.byModel}
                getRowKey={(row) => row.model}
                columns={[
                  {
                    key: 'model',
                    header: 'Model',
                    render: (row) => row.model,
                  },
                  {
                    key: 'count',
                    header: 'Entries',
                    align: 'right',
                    render: (row) => row.count.toLocaleString(),
                  },
                  {
                    key: 'cost',
                    header: 'Billable',
                    align: 'right',
                    render: (row) => (
                      <CostCell billableCost={row.billableCost} rawCost={row.rawCost} />
                    ),
                  },
                ]}
              />
            </div>
          )}
        </SettingsSection>
      )}

      {tab === 'all' && data.byActor.length > 0 && (
        <SettingsSection label='By actor'>
          <p className='mb-4 text-[var(--text-secondary)] text-small'>
            Who triggered usage — grouped by actor type and resolved user.
          </p>
          <CostBreakdownTable
            rows={data.byActor}
            getRowKey={(row) => `${row.actorType ?? 'unknown'}-${row.actorUserId ?? 'none'}`}
            columns={[
              {
                key: 'actor',
                header: 'Actor',
                render: (row) => {
                  const name = row.actorUserId
                    ? (userNameById.get(row.actorUserId) ?? row.actorUserId)
                    : '—'
                  return (
                    <span>
                      {name}
                      <span className='ml-1 text-[var(--text-muted)]'>
                        ({formatActorType(row.actorType)})
                      </span>
                    </span>
                  )
                },
              },
              {
                key: 'count',
                header: 'Entries',
                align: 'right',
                render: (row) => row.count.toLocaleString(),
              },
              {
                key: 'tokens',
                header: 'Tokens',
                align: 'right',
                render: (row) => formatTokenCount(row.usage.totalTokens),
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
      )}

      {tab === 'all' && data.byUser.length > 0 && (
        <SettingsSection label='By billing user'>
          <CostBreakdownTable
            rows={data.byUser}
            getRowKey={(row) => row.userId}
            columns={[
              {
                key: 'user',
                header: 'User',
                render: (row) => userNameById.get(row.userId) ?? row.userId,
              },
              {
                key: 'count',
                header: 'Entries',
                align: 'right',
                render: (row) => row.count.toLocaleString(),
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
      )}

      {tab === 'all' && data.byVendor.length > 0 && (
        <SettingsSection label='External vendor spend'>
          <p className='mb-4 text-[var(--text-secondary)] text-small'>
            Pass-through third-party API costs tracked via Cost blocks.
          </p>
          <CostBreakdownTable
            rows={data.byVendor}
            getRowKey={(row) => row.vendor}
            columns={[
              {
                key: 'vendor',
                header: 'Vendor',
                render: (row) => row.vendor,
              },
              {
                key: 'count',
                header: 'Entries',
                align: 'right',
                render: (row) => row.count.toLocaleString(),
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
      )}

      {tab === 'all' &&
        (data.byModel.length > 0 || data.byProvider.length > 0 || data.byTool.length > 0) && (
          <SettingsSection label='Model & tool usage'>
            {data.byModel.length > 0 && (
              <CostBreakdownTable
                rows={data.byModel}
                getRowKey={(row) => row.model}
                columns={[
                  { key: 'model', header: 'Model', render: (row) => row.model },
                  {
                    key: 'count',
                    header: 'Entries',
                    align: 'right',
                    render: (row) => row.count.toLocaleString(),
                  },
                  {
                    key: 'cost',
                    header: 'Billable',
                    align: 'right',
                    render: (row) => (
                      <CostCell billableCost={row.billableCost} rawCost={row.rawCost} />
                    ),
                  },
                ]}
              />
            )}
            {data.byProvider.length > 0 && (
              <div className='mt-6'>
                <p className='mb-2 text-[var(--text-muted)] text-small'>By provider</p>
                <CostBreakdownTable
                  rows={data.byProvider}
                  getRowKey={(row) => row.provider}
                  columns={[
                    { key: 'provider', header: 'Provider', render: (row) => row.provider },
                    {
                      key: 'count',
                      header: 'Entries',
                      align: 'right',
                      render: (row) => row.count.toLocaleString(),
                    },
                    {
                      key: 'cost',
                      header: 'Billable',
                      align: 'right',
                      render: (row) => (
                        <CostCell billableCost={row.billableCost} rawCost={row.rawCost} />
                      ),
                    },
                  ]}
                />
              </div>
            )}
            {data.byTool.length > 0 && (
              <div className='mt-6'>
                <p className='mb-2 text-[var(--text-muted)] text-small'>By tool</p>
                <CostBreakdownTable
                  rows={data.byTool}
                  getRowKey={(row) => row.toolId}
                  columns={[
                    { key: 'tool', header: 'Tool', render: (row) => row.toolId },
                    {
                      key: 'count',
                      header: 'Entries',
                      align: 'right',
                      render: (row) => row.count.toLocaleString(),
                    },
                    {
                      key: 'cost',
                      header: 'Billable',
                      align: 'right',
                      render: (row) => (
                        <CostCell billableCost={row.billableCost} rawCost={row.rawCost} />
                      ),
                    },
                  ]}
                />
              </div>
            )}
          </SettingsSection>
        )}
    </div>
  )
}

export function Usage() {
  const { workspaceId } = useParams<{ workspaceId: string }>()
  const [{ tab, period, allTime, rootExecutionId }, setUsageParams] = useQueryStates(
    usageParsers,
    usageUrlKeys
  )

  const { data: permissions, isPending: permissionsLoading } =
    useWorkspacePermissionsQuery(workspaceId)
  const isWorkspaceAdmin = permissions?.viewer?.isAdmin ?? false

  const analyticsQuery = useMemo(() => {
    const base = allTime
      ? { allTime: 'true' as const }
      : { period: period as UsagePeriod }

    const withLineage =
      rootExecutionId && (tab === 'workflow' || tab === 'all')
        ? { rootExecutionId }
        : {}

    if (tab === 'workflow') return { ...base, ...withLineage, sources: 'workflow' }
    if (tab === 'mothership') return { ...base, sources: MOTHERSHIP_USAGE_SOURCES }
    return { ...base, ...withLineage }
  }, [allTime, period, rootExecutionId, tab])

  const { data, isLoading, isFetching, error, refetch } = useWorkspaceUsageAnalytics(
    isWorkspaceAdmin ? workspaceId : undefined,
    analyticsQuery
  )

  const userNameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const user of permissions?.users ?? []) {
      map.set(user.userId, user.name ?? user.email)
    }
    return map
  }, [permissions?.users])

  const handleSelectRoot = (nextRootExecutionId: string) => {
    void setUsageParams({ rootExecutionId: nextRootExecutionId, tab: 'workflow' })
  }

  const handleClearDrillDown = () => {
    void setUsageParams({ rootExecutionId: null })
  }

  if (permissionsLoading) {
    return (
      <div className='flex items-center justify-center py-16'>
        <Loader className='size-5 text-[var(--text-muted)]' />
      </div>
    )
  }

  if (!isWorkspaceAdmin) {
    return (
      <div className='px-6 py-8'>
        <p className='text-[var(--text-secondary)] text-small'>
          Workspace admin access is required to view usage analytics.
        </p>
      </div>
    )
  }

  const periodLabel = allTime
    ? 'All time'
    : data
      ? `${formatPeriodLabel(period)} · ${new Date(data.period.startTime).toLocaleDateString()} – ${new Date(data.period.endTime).toLocaleDateString()}`
      : formatPeriodLabel(period)

  return (
    <div className='flex h-full flex-col bg-[var(--bg)]'>
      <div className='min-h-0 flex-1 overflow-y-auto px-6 [scrollbar-gutter:stable_both-edges]'>
        <div className='mx-auto flex max-w-[56rem] flex-col gap-6 pt-6 pb-8'>
          <div className='flex flex-col gap-4'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
              <div>
                <h1 className='font-medium text-[var(--text-primary)] text-lg'>Usage</h1>
                <p className='mt-0.5 text-[var(--text-secondary)] text-small'>{periodLabel}</p>
              </div>
              <button
                type='button'
                onClick={() => void refetch()}
                disabled={isFetching}
                className='flex items-center gap-1.5 rounded-md px-2 py-1 text-[var(--text-secondary)] text-small transition-colors hover-hover:bg-[var(--surface-2)] hover-hover:text-[var(--text-primary)] disabled:opacity-50'
              >
                <RefreshCw className={cn('size-[14px]', isFetching && 'animate-spin')} />
                Refresh
              </button>
            </div>

            <div className='flex flex-wrap items-center gap-3'>
              <ButtonGroup
                value={tab}
                onValueChange={(value) =>
                  void setUsageParams({
                    tab: value as UsageTab,
                    rootExecutionId: value === 'mothership' ? null : rootExecutionId,
                  })
                }
              >
                {USAGE_TABS.map((tabId) => (
                  <ButtonGroupItem key={tabId} value={tabId}>
                    {TAB_LABELS[tabId]}
                  </ButtonGroupItem>
                ))}
              </ButtonGroup>

              <div className='flex flex-wrap items-center gap-2'>
                <ButtonGroup
                  value={allTime ? 'all' : period}
                  onValueChange={(value) => {
                    if (value === 'all') {
                      void setUsageParams({ allTime: true })
                      return
                    }
                    void setUsageParams({ allTime: false, period: value as UsagePeriod })
                  }}
                >
                  {USAGE_PERIODS.map((periodId) => (
                    <ButtonGroupItem key={periodId} value={periodId}>
                      {formatPeriodLabel(periodId)}
                    </ButtonGroupItem>
                  ))}
                  <ButtonGroupItem value='all'>All time</ButtonGroupItem>
                </ButtonGroup>
              </div>
            </div>
          </div>

          <div className='flex flex-wrap gap-3'>
            <SummaryCard
              label='Billable cost'
              value={data ? formatBillableWithCredits(data.summary.billableCost) : '—'}
              isLoading={isLoading}
            />
            <SummaryCard
              label='Raw cost'
              value={data ? formatDollarAmount(data.summary.rawCost) : '—'}
              isLoading={isLoading}
            />
            <SummaryCard
              label='Usage volume'
              value={data ? formatUsageMetricsSummary(data.summary.usage) : '—'}
              isLoading={isLoading}
            />
            <SummaryCard
              label='Ledger entries'
              value={data ? data.summary.ledgerEntryCount.toLocaleString() : '—'}
              isLoading={isLoading}
            />
            {(tab === 'all' || tab === 'workflow') && (
              <SummaryCard
                label='Executions'
                value={data ? data.summary.executionCount.toLocaleString() : '—'}
                isLoading={isLoading}
              />
            )}
            {(tab === 'all' || tab === 'mothership') && (
              <>
                <SummaryCard
                  label='Chats'
                  value={data ? data.summary.chatCount.toLocaleString() : '—'}
                  isLoading={isLoading}
                />
                <SummaryCard
                  label='Runs'
                  value={data ? data.summary.runCount.toLocaleString() : '—'}
                  isLoading={isLoading}
                />
              </>
            )}
          </div>

          {error && (
            <div className='rounded-lg border border-[var(--border)] bg-[var(--surface-3)] px-4 py-3'>
              <p className='text-[var(--text-primary)] text-small'>
                Failed to load usage analytics.
              </p>
              <p className='mt-1 text-[var(--text-muted)] text-small'>{error.message}</p>
            </div>
          )}

          {isLoading && !data && (
            <div className='flex items-center justify-center py-12'>
              <Loader className='size-5 text-[var(--text-muted)]' />
            </div>
          )}

          {data && (
            <UsageDashboardContent
              workspaceId={workspaceId}
              data={data}
              tab={tab}
              userNameById={userNameById}
              rootExecutionId={rootExecutionId}
              onSelectRoot={handleSelectRoot}
              onClearDrillDown={handleClearDrillDown}
            />
          )}

          {data &&
            !isLoading &&
            data.summary.ledgerEntryCount === 0 &&
            data.summary.executionCount === 0 &&
            data.summary.chatCount === 0 && (
              <div className='flex flex-col items-center gap-2 py-8 text-center'>
                <Badge variant='gray-secondary' size='sm'>
                  No usage recorded
                </Badge>
                <p className='max-w-md text-[var(--text-muted)] text-small'>
                  No billing ledger entries were found for this workspace in the selected period.
                  Workflow and mothership activity may still exist without cost rows.
                </p>
              </div>
            )}
        </div>
      </div>
    </div>
  )
}

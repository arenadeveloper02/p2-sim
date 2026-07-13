'use client'

import { ChipLink } from '@/components/emcn'
import type { OrganizationUsageAnalytics } from '@/lib/api/contracts/organization-usage'
import {
  CostBreakdownTable,
  CostCell,
} from '@/app/workspace/[workspaceId]/settings/components/usage/components/cost-breakdown-table'
import { DataHealthPanel } from '@/app/workspace/[workspaceId]/settings/components/usage/components/data-health-panel'
import { UsageTimeSeriesChart } from '@/app/workspace/[workspaceId]/settings/components/usage/components/usage-time-series-chart'
import {
  formatActorType,
  formatSourceLabel,
  formatTokenCount,
} from '@/app/workspace/[workspaceId]/settings/components/usage/format'
import type { UsageTab } from '@/app/workspace/[workspaceId]/settings/components/usage/search-params'
import { SettingsSection } from '@/app/workspace/[workspaceId]/settings/components/settings-section/settings-section'
import { getMothershipChatPath } from '@/app/workspace/[workspaceId]/home/mothership-chat-path'

interface OrganizationUsageContentProps {
  data: OrganizationUsageAnalytics
  tab: UsageTab
  userNameById: Map<string, string>
}

function workspaceUsageHref(workspaceId: string): string {
  return `/workspace/${workspaceId}/settings/usage`
}

function workflowLogsHref(workspaceId: string, workflowId: string): string {
  return `/workspace/${workspaceId}/logs?workflowIds=${workflowId}`
}

/**
 * Phase 1 organization usage panels — totals, by-workspace rollup, and cost leaders
 * (workflows, mothership chats, actors).
 */
export function OrganizationUsageContent({
  data,
  tab,
  userNameById,
}: OrganizationUsageContentProps) {
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

      {data.byWorkspace.length > 0 && (
        <SettingsSection label='By workspace'>
          <p className='mb-4 text-[var(--text-secondary)] text-small'>
            Cost across {data.workspaces.length.toLocaleString()} active organization workspace
            {data.workspaces.length === 1 ? '' : 's'}.
          </p>
          <CostBreakdownTable
            rows={data.byWorkspace}
            getRowKey={(row) => row.workspaceId}
            emptyMessage='No workspace cost in this period.'
            columns={[
              {
                key: 'workspace',
                header: 'Workspace',
                render: (row) => (
                  <ChipLink
                    href={workspaceUsageHref(row.workspaceId)}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    {row.workspaceName}
                  </ChipLink>
                ),
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

      {showWorkflow && data.workflow.byWorkflow.length > 0 && (
        <SettingsSection label='Most expensive workflows'>
          <CostBreakdownTable
            rows={data.workflow.byWorkflow}
            getRowKey={(row) =>
              `${row.workspaceId}-${row.workflowId ?? row.workflowName ?? 'unknown'}`
            }
            emptyMessage='No workflow cost in this period.'
            columns={[
              {
                key: 'workflow',
                header: 'Workflow',
                render: (row) => {
                  const label = row.workflowName ?? row.workflowId ?? 'Unknown workflow'
                  if (row.workflowId) {
                    return (
                      <ChipLink
                        href={workflowLogsHref(row.workspaceId, row.workflowId)}
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
                key: 'workspace',
                header: 'Workspace',
                render: (row) => (
                  <ChipLink
                    href={workspaceUsageHref(row.workspaceId)}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    {row.workspaceName}
                  </ChipLink>
                ),
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
        </SettingsSection>
      )}

      {showMothership && data.copilot.byChat.length > 0 && (
        <SettingsSection label='Most expensive chats'>
          <p className='mb-4 text-[var(--text-secondary)] text-small'>
            Top {data.copilot.byChat.length} mothership and copilot chats by billable cost across
            the organization.
          </p>
          <CostBreakdownTable
            rows={data.copilot.byChat}
            getRowKey={(row) => `${row.workspaceId}-${row.chatId}`}
            emptyMessage='No mothership chat cost in this period.'
            columns={[
              {
                key: 'chat',
                header: 'Chat',
                render: (row) => {
                  const label = row.title?.trim() || `${row.chatId.slice(0, 8)}…`
                  if (row.chatType === 'mothership') {
                    return (
                      <ChipLink
                        href={getMothershipChatPath(row.workspaceId, row.chatId)}
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
                key: 'workspace',
                header: 'Workspace',
                render: (row) => (
                  <ChipLink
                    href={workspaceUsageHref(row.workspaceId)}
                    target='_blank'
                    rel='noopener noreferrer'
                  >
                    {row.workspaceName}
                  </ChipLink>
                ),
              },
              {
                key: 'user',
                header: 'Owner',
                render: (row) => userNameById.get(row.userId) ?? row.userId,
              },
              {
                key: 'type',
                header: 'Type',
                render: (row) => <span className='capitalize'>{row.chatType}</span>,
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
        </SettingsSection>
      )}

      {tab !== 'workflow' && data.byActor.length > 0 && (
        <SettingsSection label='By actor'>
          <p className='mb-4 text-[var(--text-secondary)] text-small'>
            Who triggered usage across organization workspaces — stamped ledger actor when present,
            otherwise mothership chat owner or billing user.
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
    </div>
  )
}

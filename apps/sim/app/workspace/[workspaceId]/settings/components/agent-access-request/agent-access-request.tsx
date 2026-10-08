'use client'

import { useMemo, useState } from 'react'
import { Checkbox, ChipTag, toast } from '@sim/emcn'
import { getErrorMessage } from '@sim/utils/errors'
import { useParams } from 'next/navigation'
import type {
  AgentAccessRequestDecisionStatus,
  AgentAccessRequestRow,
} from '@/lib/api/contracts/agent-access-requests'
import { useSession } from '@/lib/auth/auth-client'
import { SettingsEmptyState } from '@/app/workspace/[workspaceId]/settings/components/settings-empty-state'
import { SettingsPanel } from '@/app/workspace/[workspaceId]/settings/components/settings-panel'
import {
  useAgentAccessRequests,
  useApproveAgentAccessRequests,
} from '@/hooks/queries/agent-access-requests'

const COLUMNS = [
  { key: 'agent_name', label: 'Agent name' },
  { key: 'status', label: 'Status' },
  { key: 'requested_user_email', label: 'Requested user email' },
  { key: 'requested_user_name', label: 'Requested user name' },
  { key: 'approved_by', label: 'Approved by' },
  { key: 'created_at', label: 'Created at' },
  { key: 'updated_at', label: 'Updated at' },
  { key: 'id', label: 'ID' },
  { key: 'workflow_id', label: 'Workflow ID' },
  { key: 'workspace_id', label: 'Workspace ID' },
] as const satisfies ReadonlyArray<{
  key: keyof AgentAccessRequestRow
  label: string
}>

function isSelectableRow(row: AgentAccessRequestRow): boolean {
  const status = row.status.trim().toLowerCase()
  return status === 'open' || status === 'cancelled'
}

function formatCellValue(key: keyof AgentAccessRequestRow, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if ((key === 'created_at' || key === 'updated_at') && typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
  }
  return String(value)
}

function statusTagProps(status: string): {
  variant: 'workflow' | 'gray'
  tone?: 'blue' | 'green' | 'orange' | 'neutral'
} {
  switch (status.trim().toLowerCase()) {
    case 'open':
      return { variant: 'workflow', tone: 'blue' }
    case 'done':
      return { variant: 'workflow', tone: 'green' }
    case 'cancelled':
      return { variant: 'workflow', tone: 'orange' }
    default:
      return { variant: 'gray' }
  }
}

/** Platform-admin settings surface for reviewing agent access requests. */
export function AgentAccessRequest() {
  const params = useParams()
  const workspaceId = typeof params?.workspaceId === 'string' ? params.workspaceId : ''
  const { data: session } = useSession()
  const approvedByEmail = session?.user?.email?.trim() ?? ''
  const {
    data: rows,
    isPending,
    isError,
    error,
    refetch,
    isFetching,
  } = useAgentAccessRequests(workspaceId)
  const approveMutation = useApproveAgentAccessRequests(workspaceId)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const selectableRows = useMemo(() => (rows ?? []).filter(isSelectableRow), [rows])
  const selectedCount = selectedIds.size
  const allSelectableSelected =
    selectableRows.length > 0 && selectableRows.every((row) => selectedIds.has(row.id))
  const canDecide =
    selectedCount > 0 && Boolean(approvedByEmail) && !approveMutation.isPending && Boolean(workspaceId)

  const toggleRow = (rowId: string, checked: boolean) => {
    setSelectedIds((previous) => {
      const next = new Set(previous)
      if (checked) next.add(rowId)
      else next.delete(rowId)
      return next
    })
  }

  const toggleAllSelectable = (checked: boolean) => {
    setSelectedIds(() => {
      if (!checked) return new Set()
      return new Set(selectableRows.map((row) => row.id))
    })
  }

  const applyDecision = (status: AgentAccessRequestDecisionStatus) => {
    const accessIds = Array.from(selectedIds)
    if (accessIds.length === 0 || approveMutation.isPending || !approvedByEmail) return

    approveMutation.mutate(
      { accessIds, status, approvedBy: approvedByEmail },
      {
        onSuccess: async () => {
          setSelectedIds(new Set())
          toast.success(status === 'done' ? 'Access approved' : 'Access cancelled', {
            description: `Updated ${accessIds.length} request${accessIds.length === 1 ? '' : 's'}.`,
          })
          await refetch()
        },
        onError: (mutationError) => {
          toast.error('Unable to update requests', {
            description: getErrorMessage(mutationError, 'Please try again.'),
          })
        },
      }
    )
  }

  return (
    <SettingsPanel
      actions={[
        {
          id: 'refresh',
          text: isFetching ? 'Refreshing...' : 'Refresh',
          onSelect: () => void refetch(),
          disabled: isFetching || approveMutation.isPending || !workspaceId,
        },
        {
          id: 'approve',
          text: approveMutation.isPending ? 'Updating...' : 'Approve',
          variant: 'primary',
          onSelect: () => applyDecision('done'),
          disabled: !canDecide,
        },
        {
          id: 'cancel',
          text: 'Cancel',
          variant: 'destructive',
          onSelect: () => applyDecision('cancelled'),
          disabled: !canDecide,
        },
      ]}
    >
      {isPending ? (
        <SettingsEmptyState>Loading agent access requests...</SettingsEmptyState>
      ) : isError ? (
        <SettingsEmptyState tone='error'>
          {error.message || 'Unable to load agent access requests'}
        </SettingsEmptyState>
      ) : !rows || rows.length === 0 ? (
        <SettingsEmptyState>No agent access requests for this workspace.</SettingsEmptyState>
      ) : (
        <div className='flex flex-col gap-3'>
          <p className='text-[var(--text-muted)] text-sm'>
            {selectedCount > 0
              ? `${selectedCount} selected — choose Approve or Cancel.`
              : 'Select open or cancelled requests, then Approve or Cancel.'}
          </p>
          <div className='overflow-x-auto rounded-[8px] border border-[var(--border)]'>
            <table className='w-full min-w-[1180px] border-collapse text-left'>
              <thead>
                <tr className='border-[var(--border)] border-b bg-[var(--bg)]'>
                  <th className='w-10 px-3 py-2'>
                    <Checkbox
                      checked={allSelectableSelected}
                      disabled={selectableRows.length === 0 || approveMutation.isPending}
                      onCheckedChange={(checked) => toggleAllSelectable(checked === true)}
                      aria-label='Select all open or cancelled requests'
                    />
                  </th>
                  {COLUMNS.map((column) => (
                    <th
                      key={column.key}
                      className='whitespace-nowrap px-3 py-2 font-medium text-[var(--text-tertiary)] text-caption'
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const selectable = isSelectableRow(row)
                  const checked = selectedIds.has(row.id)
                  return (
                    <tr
                      key={row.id}
                      className='border-[var(--border)] border-b last:border-b-0 hover:bg-[var(--surface-hover)]'
                    >
                      <td className='px-3 py-2'>
                        <Checkbox
                          checked={checked}
                          disabled={!selectable || approveMutation.isPending}
                          onCheckedChange={(next) => toggleRow(row.id, next === true)}
                          aria-label={`Select ${row.agent_name}`}
                        />
                      </td>
                      {COLUMNS.map((column) => (
                        <td
                          key={column.key}
                          className={
                            column.key === 'status'
                              ? 'whitespace-nowrap px-3 py-2 text-sm'
                              : 'max-w-[220px] truncate px-3 py-2 text-[var(--text-body)] text-sm'
                          }
                          title={formatCellValue(column.key, row[column.key])}
                        >
                          {column.key === 'status' ? (
                            <ChipTag {...statusTagProps(row.status)}>{row.status}</ChipTag>
                          ) : (
                            formatCellValue(column.key, row[column.key])
                          )}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </SettingsPanel>
  )
}

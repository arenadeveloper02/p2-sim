'use client'

import { cn } from '@sim/emcn'
import type { WorkflowPatch, WorkflowPatchOperation } from '@/local-copilot/lib/types'

interface PatchPreviewProps {
  patch: WorkflowPatch
  className?: string
}

export function PatchPreview({ patch, className }: PatchPreviewProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-1)] p-3',
        className
      )}
    >
      <div>
        <p className='font-medium text-[13px] text-[var(--text-body)]'>{patch.summary}</p>
        <p className='text-[12px] text-[var(--text-muted)]'>
          {patch.changes.length} change{patch.changes.length === 1 ? '' : 's'} — review before
          applying
        </p>
      </div>

      <ul className='flex max-h-[240px] flex-col gap-2 overflow-y-auto'>
        {patch.changes.map((change, index) => (
          <li
            key={`${change.operation}-${index}`}
            className='rounded-md bg-[var(--surface-2)] px-2 py-1.5 font-mono text-[11px] text-[var(--text-body)]'
          >
            <span className='text-[var(--text-accent)]'>{change.operation}</span>{' '}
            {formatChangeDetail(change)}
          </li>
        ))}
      </ul>

      {patch.warnings?.length ? (
        <div className='flex flex-col gap-1'>
          <p className='font-medium text-[12px] text-[var(--text-warning)]'>Warnings</p>
          {patch.warnings.map((warning) => (
            <p key={warning} className='text-[12px] text-[var(--text-muted)]'>
              {warning}
            </p>
          ))}
        </div>
      ) : null}

      {patch.recommendations?.length ? (
        <div className='flex flex-col gap-1'>
          <p className='font-medium text-[12px] text-[var(--text-body)]'>Recommendations</p>
          {patch.recommendations.map((item) => (
            <p key={item} className='text-[12px] text-[var(--text-muted)]'>
              {item}
            </p>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function formatChangeDetail(change: WorkflowPatchOperation): string {
  switch (change.operation) {
    case 'add_block':
      return change.block.name || change.block.type || change.block.id
    case 'update_block':
      return change.blockId
    case 'remove_block':
      return change.blockId
    case 'add_edge':
      return `${change.edge.source} → ${change.edge.target}`
    case 'remove_edge':
      return change.edgeId
    case 'add_variable':
      return change.variable.name || change.variable.id
    case 'update_variable':
    case 'remove_variable':
      return change.variableId
    default:
      return ''
  }
}

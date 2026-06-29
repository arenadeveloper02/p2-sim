/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  editWorkflowNeedsFollowUp,
  formatToolResultForLlm,
  sortToolCallsForExecution,
} from '@/local-copilot/lib/tools/format-tool-result'

describe('sortToolCallsForExecution', () => {
  it('runs create_workflow before edit_workflow', () => {
    const calls = [
      { id: '2', name: 'edit_workflow', arguments: '{}' },
      { id: '1', name: 'create_workflow', arguments: '{}' },
    ]
    const sorted = sortToolCallsForExecution(calls)
    expect(sorted.map((c) => c.name)).toEqual(['create_workflow', 'edit_workflow'])
  })
})

describe('editWorkflowNeedsFollowUp', () => {
  it('returns true when skippedItems present', () => {
    expect(editWorkflowNeedsFollowUp({ success: true, skippedItems: [{ reason: 'bad' }] })).toBe(
      true
    )
  })

  it('returns false when edit fully succeeded', () => {
    expect(editWorkflowNeedsFollowUp({ success: true, workflowId: 'wf-1' })).toBe(false)
  })
})

describe('formatToolResultForLlm', () => {
  it('adds needsFollowUpEdit when edit had skipped items', () => {
    const json = formatToolResultForLlm('edit_workflow', {
      success: true,
      skippedItems: [{ reason: 'block_not_found' }],
    })
    const parsed = JSON.parse(json) as Record<string, unknown>
    expect(parsed.needsFollowUpEdit).toBe(true)
    expect(parsed.followUpHint).toBeTruthy()
  })
})

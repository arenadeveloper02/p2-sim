/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildFollowUpContinuationMessage,
  detectMandatoryFollowUp,
  editWorkflowNeedsFollowUp,
  formatToolResultForLlm,
  resolveMandatoryFollowUps,
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
  it('truncates large function_execute stdout', () => {
    const stdout = 'x'.repeat(20_000)
    const json = formatToolResultForLlm('function_execute', { success: true, stdout, result: null })
    const parsed = JSON.parse(json) as Record<string, unknown>
    expect(parsed.capturedOutputTruncated).toBe(true)
    expect(String(parsed.capturedOutput).length).toBeLessThan(stdout.length)
  })

  it('surfaces return values in capturedOutput when stdout is empty', () => {
    const json = formatToolResultForLlm('function_execute', {
      success: true,
      stdout: '',
      result: { primes: [2, 3, 5, 7] },
    })
    const parsed = JSON.parse(json) as Record<string, unknown>
    expect(parsed.capturedOutput).toContain('primes')
    expect(parsed.readOutputFrom).toBe('result')
  })

  it('normalizes daytona invoke_integration_tool output', () => {
    const json = formatToolResultForLlm('invoke_integration_tool', {
      toolId: 'daytona_run_code',
      output: { exitCode: 0, result: '42\n', artifacts: null },
    })
    const parsed = JSON.parse(json) as Record<string, unknown>
    expect(parsed.capturedOutput).toBe('42')
  })

  it('flags empty create_file shells for follow-up write', () => {
    const json = formatToolResultForLlm('create_file', {
      success: true,
      message: 'created',
      data: { vfsPath: 'files/notes.md', size: 0 },
    })
    const parsed = JSON.parse(json) as Record<string, unknown>
    expect(parsed.needsFollowUpWrite).toBe(true)
    expect(parsed.followUpHint).toBeTruthy()
  })

  it('adds needsFollowUpEdit when edit had skipped items', () => {
    const json = formatToolResultForLlm('edit_workflow', {
      success: true,
      skippedItems: [{ reason: 'block_not_found' }],
    })
    const parsed = JSON.parse(json) as Record<string, unknown>
    expect(parsed.needsFollowUpEdit).toBe(true)
    expect(parsed.followUpHint).toBeTruthy()
  })

  it('flags workspace_file update intents for edit_content follow-up', () => {
    const json = formatToolResultForLlm('workspace_file', {
      success: true,
      message: 'Intent set: update "notes.md".',
      data: { id: 'f1', name: 'notes.md', vfsPath: 'files/notes.md', operation: 'update' },
    })
    const parsed = JSON.parse(json) as Record<string, unknown>
    expect(parsed.needsFollowUpEditContent).toBe(true)
  })

  it('flags successful create_workflow for populate follow-up', () => {
    const json = formatToolResultForLlm('create_workflow', {
      success: true,
      workflowId: 'wf-1',
    })
    const parsed = JSON.parse(json) as Record<string, unknown>
    expect(parsed.needsFollowUpPopulate).toBe(true)
  })
})

describe('mandatory follow-up tracking', () => {
  it('detects and resolves create_file write follow-up after edit_content', () => {
    const formatted = formatToolResultForLlm('create_file', {
      success: true,
      data: { vfsPath: 'files/notes.md', size: 0 },
    })
    const followUp = detectMandatoryFollowUp('create_file', formatted)
    expect(followUp?.id).toBe('create_file:write')

    const pending = followUp ? [followUp] : []
    const resolved = resolveMandatoryFollowUps(pending, 'edit_content', true, { success: true })
    expect(resolved).toHaveLength(0)
  })

  it('builds continuation message for pending follow-ups', () => {
    const message = buildFollowUpContinuationMessage([
      {
        id: 'workspace_file:edit-content',
        hint: 'Call edit_content with the markdown body.',
        resolveWith: ['edit_content'],
      },
    ])
    expect(message).toContain('edit_content')
    expect(message).toContain('not complete')
  })
})

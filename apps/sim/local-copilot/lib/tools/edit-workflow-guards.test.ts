/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/workflows/sanitization/json-sanitizer', () => ({
  sanitizeForCopilot: (value: unknown) => value,
}))

vi.mock('@/lib/copilot/chat/document-format-guidance', () => ({
  documentLayoutFollowUpHint: (_fileName: string, hint: string) => hint,
}))

vi.mock('@/lib/core/security/redaction', () => ({
  REDACTED_MARKER: '[REDACTED]',
}))

vi.mock('@/triggers/webhook-url', () => ({
  blockAdvertisesWebhookUrl: () => false,
  resolveBlockTriggerId: () => undefined,
}))

vi.mock('@/triggers/constants', () => ({
  TRIGGER_ROUTING_FIELD: 'triggerRouting',
  TRIGGER_WEBHOOK_URL_FIELD: 'webhookUrl',
}))

import { fingerprintToolCall } from '@/local-copilot/lib/agent/tool-stagnation'
import {
  classifyEditWorkflowPrecondition,
  coalesceToolExecutionPayloadForLlm,
  detectMandatoryFollowUp,
  editWorkflowNeedsFollowUp,
  formatToolResultForLlm,
} from '@/local-copilot/lib/tools/format-tool-result'

describe('editWorkflowNeedsFollowUp precondition gates', () => {
  it('does not treat get_blocks_metadata gate as a bare edit repair', () => {
    const output = {
      success: false,
      error: 'Call get_blocks_metadata for [agent] before edit_workflow.',
    }
    expect(editWorkflowNeedsFollowUp(output)).toBe(false)
    expect(classifyEditWorkflowPrecondition(output)).toBe('metadata')
  })

  it('still flags partial apply as needs follow-up', () => {
    expect(editWorkflowNeedsFollowUp({ success: true, partialApply: true })).toBe(true)
  })

  it('routes metadata precondition to get_blocks_metadata then edit', () => {
    const formatted = formatToolResultForLlm('edit_workflow', {
      success: false,
      error: 'Call get_blocks_metadata for [agent] before edit_workflow.',
    })
    const followUp = detectMandatoryFollowUp('edit_workflow', formatted)
    expect(followUp?.resolveWith).toEqual(['get_blocks_metadata', 'edit_workflow'])
  })

  it('routes stale revision to get_workflow_context then edit', () => {
    const formatted = formatToolResultForLlm('edit_workflow', {
      success: false,
      error: 'stale revision: workflow changed since this turn loaded',
    })
    const followUp = detectMandatoryFollowUp('edit_workflow', formatted)
    expect(followUp?.resolveWith).toEqual(['get_workflow_context', 'edit_workflow'])
  })
})

describe('office empty-shell create_file results', () => {
  it('marks PDF size=0 shells as expected success and requires workspace_file', () => {
    const formatted = formatToolResultForLlm('create_file', {
      success: true,
      message: 'Empty file shell "files/Report.pdf" created.',
      data: { vfsPath: 'files/Report.pdf', name: 'Report.pdf', size: 0 },
    })
    const parsed = JSON.parse(formatted) as Record<string, unknown>
    expect(parsed.expectedEmptyShell).toBe(true)
    expect(parsed.needsFollowUpWorkspaceFile).toBe(true)
    expect(String(parsed.followUpHint)).toMatch(/SUCCESS/i)
    expect(String(parsed.followUpHint)).not.toMatch(/tools returned empty/i)

    const followUp = detectMandatoryFollowUp('create_file', formatted)
    expect(followUp?.resolveWith).toEqual(['workspace_file'])
  })

  it('clarifies empty folder lists are not failures', () => {
    const formatted = formatToolResultForLlm('list_file_folders', {
      success: true,
      data: { folders: [] },
    })
    const parsed = JSON.parse(formatted) as Record<string, unknown>
    expect(String(parsed.followUpHint)).toMatch(/not a tool failure/i)
  })

  it('redirects create_file failures away from sandbox fallback', () => {
    const formatted = formatToolResultForLlm('create_file', {
      success: false,
      message: 'Failed to create file',
    })
    const parsed = JSON.parse(formatted) as Record<string, unknown>
    expect(String(parsed.followUpHint)).toMatch(/Do NOT switch to manage_sandbox/i)
    expect(String(parsed.followUpHint)).toMatch(/create_file again/i)
  })
})

describe('coalesceToolExecutionPayloadForLlm', () => {
  it('surfaces top-level error when result is empty', () => {
    const payload = coalesceToolExecutionPayloadForLlm({
      success: false,
      result: {},
      error: 'name is required',
      toolName: 'create_file_folder',
    })
    expect(payload).toEqual({ success: false, error: 'name is required' })
  })

  it('avoids bare {} on successful empty result', () => {
    const payload = coalesceToolExecutionPayloadForLlm({
      success: true,
      result: {},
      toolName: 'create_file_folder',
    }) as Record<string, unknown>
    expect(payload.success).toBe(true)
    expect(String(payload.message)).toContain('create_file_folder')
  })

  it('guards empty create_file_folder success through formatToolResultForLlm', () => {
    const formatted = formatToolResultForLlm(
      'create_file_folder',
      coalesceToolExecutionPayloadForLlm({
        success: true,
        result: {},
        toolName: 'create_file_folder',
      })
    )
    const parsed = JSON.parse(formatted) as Record<string, unknown>
    expect(parsed).not.toEqual({})
    expect(String(parsed.message ?? '')).toMatch(/create_file_folder|completed/i)
  })
})

describe('edit_workflow stagnation fingerprints', () => {
  it('changes when prompt values change on an incomplete edit', () => {
    const result = { success: true, partialApply: true, skippedItems: [{ reason: 'x' }] }
    const a = fingerprintToolCall(
      'edit_workflow',
      JSON.stringify({
        operations: [
          {
            block_id: 'agent-1',
            operation_type: 'edit',
            params: { systemPrompt: 'v1' },
          },
        ],
      }),
      true,
      result
    )
    const b = fingerprintToolCall(
      'edit_workflow',
      JSON.stringify({
        operations: [
          {
            block_id: 'agent-1',
            operation_type: 'edit',
            params: { systemPrompt: 'v2-different' },
          },
        ],
      }),
      true,
      result
    )
    expect(a).not.toBe(b)
  })
})

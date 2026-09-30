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

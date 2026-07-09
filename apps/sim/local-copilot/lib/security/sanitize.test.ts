/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { redactSecrets, sanitizeForLlm } from '@/local-copilot/lib/security/sanitize'

describe('sanitize', () => {
  it('preserves UUID workflow ids', () => {
    const workflowId = '51fca091-1c62-4a4a-8d37-8c30b9ee42a5'
    expect(redactSecrets(workflowId)).toBe(workflowId)
  })

  it('preserves id fields in workspace workflow listings', () => {
    const sanitized = sanitizeForLlm({
      workspaceWorkflows: [
        {
          id: '51fca091-1c62-4a4a-8d37-8c30b9ee42a5',
          name: 'Bus Image (Quick)',
        },
      ],
    }) as { workspaceWorkflows: Array<{ id: string; name: string }> }

    expect(sanitized.workspaceWorkflows[0].id).toBe('51fca091-1c62-4a4a-8d37-8c30b9ee42a5')
    expect(sanitized.workspaceWorkflows[0].name).toBe('Bus Image (Quick)')
  })

  it('still redacts api keys', () => {
    expect(redactSecrets('sk-simabcdefghijklmnopqrstuvwxyz123456')).toBe('[REDACTED_SECRET]')
  })
})

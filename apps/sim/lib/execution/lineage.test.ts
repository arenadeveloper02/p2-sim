/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  resolveExecutionLineage,
  resolveExecutionLineageAuthMode,
  sanitizeExecutionLineageInput,
} from '@/lib/execution/lineage'

describe('resolveExecutionLineage', () => {
  it('roots at self when there is no parent', () => {
    expect(
      resolveExecutionLineage({
        executionId: 'child-1',
        triggeringChatId: 'chat-1',
      })
    ).toEqual({
      rootExecutionId: 'child-1',
      triggeringChatId: 'chat-1',
    })
  })

  it('uses parent root when provided', () => {
    expect(
      resolveExecutionLineage({
        executionId: 'child-1',
        parentExecutionId: 'parent-1',
        parentRootExecutionId: 'root-1',
      })
    ).toEqual({
      parentExecutionId: 'parent-1',
      rootExecutionId: 'root-1',
    })
  })

  it('falls back to parent id as root when parent root is unknown', () => {
    expect(
      resolveExecutionLineage({
        executionId: 'child-1',
        parentExecutionId: 'parent-1',
      })
    ).toEqual({
      parentExecutionId: 'parent-1',
      rootExecutionId: 'parent-1',
    })
  })
})

describe('sanitizeExecutionLineageInput', () => {
  it('allows all fields for internal auth', () => {
    const input = {
      parentExecutionId: 'parent-1',
      parentRootExecutionId: 'root-1',
      triggeringChatId: 'chat-1',
      triggeringRunId: 'run-1',
    }
    expect(sanitizeExecutionLineageInput(input, 'internal')).toEqual(input)
  })

  it('strips parent fields for copilot client sessions', () => {
    expect(
      sanitizeExecutionLineageInput(
        {
          parentExecutionId: 'spoof-parent',
          triggeringChatId: 'chat-1',
          triggeringRunId: 'run-1',
        },
        'copilot_client'
      )
    ).toEqual({
      triggeringChatId: 'chat-1',
      triggeringRunId: 'run-1',
    })
  })

  it('strips all lineage for external callers', () => {
    expect(
      sanitizeExecutionLineageInput(
        {
          parentExecutionId: 'parent-1',
          triggeringChatId: 'chat-1',
        },
        'external'
      )
    ).toBeUndefined()
  })
})

describe('resolveExecutionLineageAuthMode', () => {
  it('treats internal JWT as internal', () => {
    expect(
      resolveExecutionLineageAuthMode({
        authType: 'internal_jwt',
        isClientSession: false,
        triggerType: 'workflow',
      })
    ).toBe('internal')
  })

  it('allows triggering fields for copilot client sessions', () => {
    expect(
      resolveExecutionLineageAuthMode({
        authType: 'session',
        isClientSession: true,
        triggerType: 'copilot',
      })
    ).toBe('copilot_client')
  })
})

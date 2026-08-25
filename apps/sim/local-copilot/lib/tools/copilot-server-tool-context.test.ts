/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { toCopilotServerToolContext } from '@/local-copilot/lib/tools/copilot-server-tool-context'
import type { ToolExecutionContext } from '@/local-copilot/lib/tools/executor'

function baseCtx(overrides: Partial<ToolExecutionContext> = {}): ToolExecutionContext {
  return {
    userId: 'user-1',
    workspaceId: 'workspace-1',
    structuredContext: {},
    ...overrides,
  }
}

describe('toCopilotServerToolContext', () => {
  it('forwards the active tool call ID onto the trusted Copilot context', () => {
    expect(toCopilotServerToolContext(baseCtx({ activeToolCallId: 'tool-call-1' }))).toEqual(
      expect.objectContaining({
        copilotToolExecution: true,
        toolCallId: 'tool-call-1',
        userId: 'user-1',
        workspaceId: 'workspace-1',
      })
    )
  })
})

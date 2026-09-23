/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildDebugInspectionChatAppendix,
  formatDebugInspectionChatResult,
  synthesizeAssistantSummaryFromTools,
  turnHasDebugInspectionTools,
  type ToolTurnRecord,
} from '@/local-copilot/lib/synthesize-assistant-summary'
import {
  shouldForceDebugExplanationContinuation,
} from '@/local-copilot/lib/user-facing-text'

describe('debug inspection synthesis', () => {
  it('formats explain_error analysis into user-facing prose', () => {
    const record: ToolTurnRecord = {
      name: 'explain_error',
      success: true,
      result: {
        errorMessage: 'Unauthorized: invalid API key',
        blockId: 'agent-1',
        analysis: {
          rootCause: 'Credential or authentication issue',
          failingBlock: { id: 'agent-1', type: 'agent', name: 'Research Agent' },
          suggestedFixes: ['Reconnect or select the correct credential in workspace settings'],
        },
      },
    }

    const text = formatDebugInspectionChatResult(record)
    expect(text).toContain('Credential or authentication issue')
    expect(text).toContain('Research Agent')
    expect(text).toContain('Unauthorized')
    expect(text).toContain('Reconnect')
  })

  it('prefers explain_error over earlier query_logs when synthesizing', () => {
    const summary = synthesizeAssistantSummaryFromTools([
      {
        name: 'query_logs',
        success: true,
        result: { data: [{ status: 'error', workflowName: 'Demo', error: 'boom' }] },
      },
      {
        name: 'explain_error',
        success: true,
        result: {
          errorMessage: 'boom',
          analysis: {
            rootCause: 'Block execution failure',
            suggestedFixes: ['Inspect block inputs'],
          },
        },
      },
    ])

    expect(summary).toContain('Block execution failure')
    expect(summary).not.toContain('From the logs:')
  })

  it('buildDebugInspectionChatAppendix returns the latest debug tool summary', () => {
    const appendix = buildDebugInspectionChatAppendix([
      {
        name: 'get_execution_logs',
        success: true,
        result: {
          data: [{ status: 'error', workflowName: 'Pipeline', error: 'timeout' }],
        },
      },
    ])
    expect(appendix).toContain('Pipeline')
    expect(appendix).toContain('timeout')
  })

  it('turnHasDebugInspectionTools detects log/debug tools', () => {
    expect(turnHasDebugInspectionTools([{ name: 'edit_workflow', success: true, result: {} }])).toBe(
      false
    )
    expect(
      turnHasDebugInspectionTools([{ name: 'query_logs', success: true, result: {} }])
    ).toBe(true)
    expect(turnHasDebugInspectionTools([{ name: 'run', success: true, result: {} }])).toBe(true)
  })

  it('parses explain_error dumps from specialist findings', () => {
    const summary = synthesizeAssistantSummaryFromTools([
      {
        name: 'run',
        success: true,
        result: {
          message:
            '[explain_error] {"errorMessage":"Unauthorized","analysis":{"rootCause":"Credential or authentication issue","suggestedFixes":["Reconnect credentials"]}}',
        },
      },
    ])
    expect(summary).toContain('Credential or authentication issue')
    expect(summary).toContain('Reconnect')
  })
})

describe('shouldForceDebugExplanationContinuation', () => {
  it('forces a continuation when debug tools ran and no reply was streamed', () => {
    expect(
      shouldForceDebugExplanationContinuation({
        postBuildToolMode: 'all',
        forcedDebugExplanations: 0,
        maxForcedDebugExplanations: 1,
        round: 2,
        maxToolRounds: 10,
        hasDebugTools: true,
        streamedUserFacingText: '',
        roundDisplayText: '',
      })
    ).toBe(true)
  })

  it('does not force when the model already wrote a real reply', () => {
    expect(
      shouldForceDebugExplanationContinuation({
        postBuildToolMode: 'all',
        forcedDebugExplanations: 0,
        maxForcedDebugExplanations: 1,
        round: 2,
        maxToolRounds: 10,
        hasDebugTools: true,
        streamedUserFacingText: 'The agent block failed because the API key is invalid.',
        roundDisplayText: '',
      })
    ).toBe(false)
  })

  it('does not force twice', () => {
    expect(
      shouldForceDebugExplanationContinuation({
        postBuildToolMode: 'all',
        forcedDebugExplanations: 1,
        maxForcedDebugExplanations: 1,
        round: 2,
        maxToolRounds: 10,
        hasDebugTools: true,
        streamedUserFacingText: '',
        roundDisplayText: '',
      })
    ).toBe(false)
  })
})

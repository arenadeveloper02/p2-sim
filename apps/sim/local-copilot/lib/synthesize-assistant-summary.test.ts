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
  isLiveWebSearchToolCall,
  shouldForceDebugExplanationContinuation,
  shouldForceResearchSearchContinuation,
  shouldForceWorkflowBuildContinuation,
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

describe('shouldForceResearchSearchContinuation', () => {
  it('forces when research intent settled without a live search tool', () => {
    expect(
      shouldForceResearchSearchContinuation({
        postBuildToolMode: 'all',
        needsLiveSearch: true,
        forcedResearchSearchContinuations: 0,
        maxForcedResearchSearchContinuations: 1,
        round: 0,
        maxToolRounds: 10,
        hasLiveWebSearch: false,
      })
    ).toBe(true)
  })

  it('does not force after search_online / exa already ran', () => {
    expect(
      shouldForceResearchSearchContinuation({
        postBuildToolMode: 'all',
        needsLiveSearch: true,
        forcedResearchSearchContinuations: 0,
        maxForcedResearchSearchContinuations: 1,
        round: 0,
        maxToolRounds: 10,
        hasLiveWebSearch: true,
      })
    ).toBe(false)
  })

  it('does not force for non-research intents', () => {
    expect(
      shouldForceResearchSearchContinuation({
        postBuildToolMode: 'all',
        needsLiveSearch: false,
        forcedResearchSearchContinuations: 0,
        maxForcedResearchSearchContinuations: 1,
        round: 0,
        maxToolRounds: 10,
        hasLiveWebSearch: false,
      })
    ).toBe(false)
  })
})

describe('isLiveWebSearchToolCall', () => {
  it('matches search_online and exa invoke tools', () => {
    expect(isLiveWebSearchToolCall('search_online')).toBe(true)
    expect(
      isLiveWebSearchToolCall('invoke_integration_tool', JSON.stringify({ toolId: 'exa_answer' }))
    ).toBe(true)
    expect(
      isLiveWebSearchToolCall('invoke_integration_tool', JSON.stringify({ toolId: 'gmail_draft_v2' }))
    ).toBe(false)
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

describe('shouldForceWorkflowBuildContinuation', () => {
  it('forces a continuation after discovery tools with no create/edit', () => {
    expect(
      shouldForceWorkflowBuildContinuation({
        postBuildToolMode: 'all',
        forcedWorkflowBuildContinuations: 0,
        maxForcedWorkflowBuildContinuations: 2,
        round: 2,
        maxToolRounds: 10,
        hasDiscoveryTools: true,
        hasMutationTools: false,
        streamedUserFacingText: '',
        roundDisplayText: '',
      })
    ).toBe(true)
  })

  it('does not force after create_workflow / edit_workflow already ran', () => {
    expect(
      shouldForceWorkflowBuildContinuation({
        postBuildToolMode: 'all',
        forcedWorkflowBuildContinuations: 0,
        maxForcedWorkflowBuildContinuations: 2,
        round: 2,
        maxToolRounds: 10,
        hasDiscoveryTools: true,
        hasMutationTools: true,
        streamedUserFacingText: '',
        roundDisplayText: '',
      })
    ).toBe(false)
  })
})

describe('synthesizeAssistantSummaryFromTools discovery-only', () => {
  it('explains when only block discovery tools ran', () => {
    expect(
      synthesizeAssistantSummaryFromTools([
        { name: 'get_available_blocks', success: true, result: { blocks: [] } },
        { name: 'get_blocks_metadata', success: true, result: { metadata: {} } },
      ])
    ).toMatch(/looked up the available blocks/i)
  })
})

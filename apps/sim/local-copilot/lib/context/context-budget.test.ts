/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildGetWorkflowContextResult,
  LOCAL_COPILOT_DEFAULT_MAX_OUTPUT_TOKENS,
  LOCAL_COPILOT_GEMINI_38_FLASH_MAX_OUTPUT_TOKENS,
  LOCAL_COPILOT_GEMINI_38_FLASH_PROMPT_TOKEN_BUDGET,
  LOCAL_COPILOT_PROMPT_TOKEN_BUDGET,
  resolveDefaultPromptTokenSoftCap,
  resolveLocalCopilotMaxOutputTokens,
  resolveLocalCopilotPromptTokenBudget,
} from '@/local-copilot/lib/context/context-budget'
import type { LocalCopilotStructuredContext } from '@/local-copilot/lib/types'

function startOnlyContext(): LocalCopilotStructuredContext {
  return {
    workspace: { id: 'ws-1', name: 'Workspace' },
    connectedIntegrations: [],
    envVariables: ['EXA_API_KEY'],
    hostedKeysAvailable: true,
    knowledgeBases: [{ id: 'kb-1', name: 'KB', description: null }],
    tables: [{ id: 'tbl-1', name: 'Accounts', description: null }],
    workspaceFiles: [],
    workflow: {
      id: 'wf-1',
      name: 'Eventgroove B2B ABM Outreach',
      blocks: {
        start: {
          id: 'start',
          type: 'start_trigger',
          name: 'Start',
          position: { x: 0, y: 0 },
          subBlocks: {},
          outputs: {},
          enabled: true,
        },
      },
      edges: [],
      variables: {},
      loops: {},
      parallels: {},
      credentials: [],
    },
  } as LocalCopilotStructuredContext
}

describe('buildGetWorkflowContextResult', () => {
  it('does not dump workspace inventory for a Start-only workflow', () => {
    const result = buildGetWorkflowContextResult(startOnlyContext())
    expect(result.id).toBe('wf-1')
    expect(result.hint).toMatch(/edit_workflow/)
    expect(result).not.toHaveProperty('knowledgeBases')
    expect(result).not.toHaveProperty('tables')
    expect(result).not.toHaveProperty('envVariables')
    expect(result).not.toHaveProperty('workspace')
  })

  it('tells the model to edit when no workflow is open', () => {
    const result = buildGetWorkflowContextResult({
      workspace: { id: 'ws-1', name: 'Workspace' },
      connectedIntegrations: [],
      envVariables: [],
      hostedKeysAvailable: false,
    } as LocalCopilotStructuredContext)
    expect(result.workflow).toBeNull()
    expect(String(result.message)).toMatch(/edit_workflow/)
  })
})

describe('resolveDefaultPromptTokenSoftCap', () => {
  it('raises the soft cap for Gemini 3.8 Flash', () => {
    expect(resolveDefaultPromptTokenSoftCap('gemini-3.8-flash')).toBe(
      LOCAL_COPILOT_GEMINI_38_FLASH_PROMPT_TOKEN_BUDGET
    )
    expect(resolveDefaultPromptTokenSoftCap('vertex/gemini-3.8-flash', 'vertex')).toBe(
      LOCAL_COPILOT_GEMINI_38_FLASH_PROMPT_TOKEN_BUDGET
    )
  })

  it('keeps the default soft cap for other Gemini models', () => {
    expect(resolveDefaultPromptTokenSoftCap('gemini-2.5-pro')).toBe(
      LOCAL_COPILOT_PROMPT_TOKEN_BUDGET
    )
  })
})

describe('resolveLocalCopilotPromptTokenBudget', () => {
  it('soft-caps Gemini 3.8 Flash at 300k instead of 120k', () => {
    const budget = resolveLocalCopilotPromptTokenBudget({
      model: 'gemini-3.8-flash',
      provider: 'gemini',
      maxOutputTokens: LOCAL_COPILOT_GEMINI_38_FLASH_MAX_OUTPUT_TOKENS,
      toolDefinitionTokens: 0,
    })
    expect(budget.tokenBudget).toBe(LOCAL_COPILOT_GEMINI_38_FLASH_PROMPT_TOKEN_BUDGET)
    expect(budget.softCapped).toBe(true)
    expect(budget.reservedTokens).toBe(LOCAL_COPILOT_GEMINI_38_FLASH_MAX_OUTPUT_TOKENS + 4_000)
  })
})

describe('resolveLocalCopilotMaxOutputTokens', () => {
  it('returns 32k for Gemini 3.8 Flash', () => {
    expect(resolveLocalCopilotMaxOutputTokens('gemini-3.8-flash')).toBe(
      LOCAL_COPILOT_GEMINI_38_FLASH_MAX_OUTPUT_TOKENS
    )
    expect(resolveLocalCopilotMaxOutputTokens('vertex/gemini-3.8-flash')).toBe(
      LOCAL_COPILOT_GEMINI_38_FLASH_MAX_OUTPUT_TOKENS
    )
  })

  it('keeps the 8k default for other models', () => {
    expect(resolveLocalCopilotMaxOutputTokens('gemini-2.5-pro')).toBe(
      LOCAL_COPILOT_DEFAULT_MAX_OUTPUT_TOKENS
    )
  })
})

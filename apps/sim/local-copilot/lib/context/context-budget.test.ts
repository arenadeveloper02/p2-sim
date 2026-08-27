/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { buildGetWorkflowContextResult } from '@/local-copilot/lib/context/context-budget'
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

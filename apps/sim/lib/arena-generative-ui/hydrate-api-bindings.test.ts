/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  hydrateApiBindingsForCopilot,
  hydrateArenaGenerativeUiApiBindingsInOperations,
} from '@/lib/arena-generative-ui/hydrate-api-bindings'
import { NoActiveDeploymentError } from '@/lib/workflows/persistence/utils'

const WORKSPACE_ID = 'ws-1'
const WORKFLOW_ID = 'wf-backend-1'

function startTriggerBlocks(fields: Array<{ name: string; type?: string }>) {
  return {
    start: {
      type: 'start_trigger',
      subBlocks: {
        inputFormat: {
          value: fields,
        },
      },
    },
  }
}

describe('hydrateApiBindingsForCopilot', () => {
  it('hydrates a workflow stub with visitorEmail vs form email from Start', async () => {
    const result = await hydrateApiBindingsForCopilot(
      JSON.stringify([
        { key: 'qualify_lead', kind: 'workflow', workflowId: WORKFLOW_ID, stream: true },
      ]),
      { workspaceId: WORKSPACE_ID },
      {
        lookupWorkflowWorkspace: async () => WORKSPACE_ID,
        loadDeployedState: async () => ({
          blocks: startTriggerBlocks([
            { name: 'company', type: 'string' },
            { name: 'email', type: 'string' },
            { name: 'userEmail', type: 'string' },
            { name: 'loggedInEmail', type: 'string' },
          ]),
        }),
      }
    )

    expect(result.warnings).toEqual([])
    const bindings = JSON.parse(result.json)
    expect(bindings).toHaveLength(1)
    expect(bindings[0]).toMatchObject({
      key: 'qualify_lead',
      kind: 'workflow',
      workflowId: WORKFLOW_ID,
      stream: true,
    })
    expect(bindings[0].inputSchema).toEqual([
      { name: 'company', type: 'string' },
      { name: 'email', type: 'string' },
      { name: 'userEmail', type: 'string', source: 'visitorEmail' },
      { name: 'loggedInEmail', type: 'string', source: 'visitorEmail' },
    ])
  })

  it('ignores Copilot-invented inputSchema on a workflow stub', async () => {
    const result = await hydrateApiBindingsForCopilot(
      [
        {
          key: 'qualify_lead',
          kind: 'workflow',
          workflowId: WORKFLOW_ID,
          inputSchema: [{ name: 'email', type: 'string', source: 'visitorEmail' }],
          inputMapping: { email: 'arenaEmailId' },
        },
      ],
      { workspaceId: WORKSPACE_ID },
      {
        lookupWorkflowWorkspace: async () => WORKSPACE_ID,
        loadDeployedState: async () => ({
          blocks: startTriggerBlocks([{ name: 'email', type: 'string' }]),
        }),
      }
    )

    const [binding] = JSON.parse(result.json)
    expect(binding.inputSchema).toEqual([{ name: 'email', type: 'string' }])
    expect(binding.inputMapping).toBeUndefined()
  })

  it('lets a sample override declared output schema', async () => {
    const result = await hydrateApiBindingsForCopilot(
      [
        {
          key: 'run',
          kind: 'workflow',
          workflowId: WORKFLOW_ID,
          outputSample: '{"score": 91}',
        },
      ],
      { workspaceId: WORKSPACE_ID },
      {
        lookupWorkflowWorkspace: async () => WORKSPACE_ID,
        loadDeployedState: async () => ({
          blocks: startTriggerBlocks([{ name: 'company', type: 'string' }]),
        }),
      }
    )

    const [binding] = JSON.parse(result.json)
    expect(binding.outputSchema?.map((field: { name: string }) => field.name)).toEqual(['score'])
    expect(binding.outputSchemaSource).toBe('sample')
  })

  it('saves a stub and warns when the backend is not deployed', async () => {
    const result = await hydrateApiBindingsForCopilot(
      [{ key: 'qualify_lead', workflowId: WORKFLOW_ID }],
      { workspaceId: WORKSPACE_ID },
      {
        lookupWorkflowWorkspace: async () => WORKSPACE_ID,
        loadDeployedState: async () => {
          throw new NoActiveDeploymentError(WORKFLOW_ID)
        },
      }
    )

    expect(JSON.parse(result.json)).toEqual([
      {
        key: 'qualify_lead',
        label: 'qualify_lead',
        kind: 'workflow',
        workflowId: WORKFLOW_ID,
      },
    ])
    expect(result.warnings[0]).toContain('not deployed')
  })

  it('rejects a workflowId outside the canvas workspace', async () => {
    await expect(
      hydrateApiBindingsForCopilot(
        [{ key: 'qualify_lead', kind: 'workflow', workflowId: WORKFLOW_ID }],
        { workspaceId: WORKSPACE_ID },
        {
          lookupWorkflowWorkspace: async () => 'other-workspace',
          loadDeployedState: async () => ({ blocks: {} }),
        }
      )
    ).rejects.toThrow('not in this workspace')
  })

  it('fails closed on invalid JSON', async () => {
    await expect(
      hydrateApiBindingsForCopilot('qualify_lead', { workspaceId: WORKSPACE_ID })
    ).rejects.toThrow('apiBindings must be valid JSON')
  })

  it('builds an HTTP binding from a curl stub without forwarding email', async () => {
    const result = await hydrateApiBindingsForCopilot(
      [
        {
          key: 'search',
          kind: 'http',
          curl: 'curl -X POST https://example.com/search -d \'{"q":"acme"}\'',
        },
      ],
      { workspaceId: WORKSPACE_ID }
    )

    const [binding] = JSON.parse(result.json)
    expect(binding).toMatchObject({
      key: 'search',
      kind: 'http',
      http: { method: 'POST', url: 'https://example.com/search' },
    })
    expect(binding.forwardEmailId).toBeUndefined()
    expect(binding.inputSchema?.some((field: { name: string }) => field.name === 'q')).toBe(true)
  })

  it('sets forwardEmailId only when Copilot explicitly requests it', async () => {
    const result = await hydrateApiBindingsForCopilot(
      [
        {
          key: 'search',
          kind: 'http',
          curl: 'curl -X POST https://example.com/search',
          forwardEmailId: true,
        },
      ],
      { workspaceId: WORKSPACE_ID }
    )

    expect(JSON.parse(result.json)[0].forwardEmailId).toBe(true)
  })

  it('accepts an already-parsed HTTP object', async () => {
    const result = await hydrateApiBindingsForCopilot(
      [
        {
          key: 'search',
          kind: 'http',
          http: { method: 'POST', url: 'https://example.com/search' },
        },
      ],
      { workspaceId: WORKSPACE_ID }
    )

    expect(JSON.parse(result.json)[0].http.url).toBe('https://example.com/search')
  })

  it('replaces a duplicate key with the last entry', async () => {
    const result = await hydrateApiBindingsForCopilot(
      [
        { key: 'search', kind: 'http', curl: 'curl -X POST https://example.com/a' },
        { key: 'search', kind: 'http', curl: 'curl -X POST https://example.com/b' },
      ],
      { workspaceId: WORKSPACE_ID }
    )

    const bindings = JSON.parse(result.json)
    expect(bindings).toHaveLength(1)
    expect(bindings[0].http.url).toBe('https://example.com/b')
  })

  it('treats blank input as no bindings', async () => {
    await expect(hydrateApiBindingsForCopilot('', { workspaceId: WORKSPACE_ID })).resolves.toEqual({
      json: '',
      warnings: [],
    })
    await expect(hydrateApiBindingsForCopilot([], { workspaceId: WORKSPACE_ID })).resolves.toEqual({
      json: '',
      warnings: [],
    })
  })
})

describe('hydrateArenaGenerativeUiApiBindingsInOperations', () => {
  it('hydrates apiBindings on add and edit of arena_generative_ui', async () => {
    const operations = [
      {
        operation_type: 'add',
        block_id: 'gui-1',
        params: {
          type: 'arena_generative_ui',
          inputs: {
            apiBindings: [{ key: 'qualify_lead', kind: 'workflow', workflowId: WORKFLOW_ID }],
            userInput: 'Submit calls qualify_lead',
          },
        },
      },
      {
        operation_type: 'edit',
        block_id: 'gui-2',
        params: {
          inputs: {
            apiBindings: [{ key: 'search', kind: 'http', curl: 'curl https://example.com/s' }],
          },
        },
      },
    ]

    const { warnings } = await hydrateArenaGenerativeUiApiBindingsInOperations(
      operations,
      {
        workspaceId: WORKSPACE_ID,
        existingBlocks: { 'gui-2': { type: 'arena_generative_ui' } },
      },
      {
        lookupWorkflowWorkspace: async () => WORKSPACE_ID,
        loadDeployedState: async () => ({
          blocks: startTriggerBlocks([{ name: 'company', type: 'string' }]),
        }),
      }
    )

    expect(warnings).toEqual([])
    const added = JSON.parse(String(operations[0].params.inputs.apiBindings))
    expect(added[0].inputSchema).toEqual([{ name: 'company', type: 'string' }])
    const edited = JSON.parse(String(operations[1].params.inputs.apiBindings))
    expect(edited[0].http.url).toBe('https://example.com/s')
  })

  it('leaves other block types untouched', async () => {
    const operations = [
      {
        operation_type: 'add',
        block_id: 'agent-1',
        params: {
          type: 'agent',
          inputs: { apiBindings: 'not-json' },
        },
      },
    ]

    await hydrateArenaGenerativeUiApiBindingsInOperations(operations, {
      workspaceId: WORKSPACE_ID,
    })

    expect(operations[0].params.inputs.apiBindings).toBe('not-json')
  })
})

/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockLoadDeployedWorkflowState, mockLoadLastSuccessfulRunOutputSchema } = vi.hoisted(() => ({
  mockLoadDeployedWorkflowState: vi.fn(),
  mockLoadLastSuccessfulRunOutputSchema: vi.fn(),
}))

vi.mock('@/lib/workflows/persistence/utils', () => ({
  loadDeployedWorkflowState: mockLoadDeployedWorkflowState,
}))

vi.mock('@/lib/arena-generative-ui/last-run-output-schema', () => ({
  loadLastSuccessfulRunOutputSchema: mockLoadLastSuccessfulRunOutputSchema,
}))

import { refreshWorkflowBindingOutputSchemas } from '@/lib/arena-generative-ui/refresh-binding-schemas'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'

const HISTORY_FIELDS = [
  { name: 'items', type: 'array' },
  { name: 'items[].keyword', type: 'string' },
  { name: 'items[].client', type: 'string' },
]

function workflowBinding(
  overrides: Partial<ArenaGenerativeApiBinding> = {}
): ArenaGenerativeApiBinding {
  return {
    key: 'run_history',
    label: 'Run history',
    kind: 'workflow',
    workflowId: 'wf-history',
    ...overrides,
  }
}

describe('refreshWorkflowBindingOutputSchemas', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLoadLastSuccessfulRunOutputSchema.mockResolvedValue({
      fields: [],
      warnings: [],
      found: false,
    })
  })

  it('replaces a stale outputSchema with the deployed Response fields', async () => {
    mockLoadDeployedWorkflowState.mockResolvedValue({
      blocks: {
        respond: {
          type: 'response',
          subBlocks: {
            builderData: {
              value: [
                {
                  name: 'items',
                  type: 'array',
                  value: [
                    {
                      type: 'object',
                      value: [
                        { name: 'keyword', type: 'string', value: '' },
                        { name: 'client', type: 'string', value: '' },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    })

    const refreshed = await refreshWorkflowBindingOutputSchemas([
      workflowBinding({ outputSchema: [{ name: 'history', type: 'array' }] }),
    ])

    expect(refreshed[0]?.outputSchema).toEqual(HISTORY_FIELDS)
    expect(mockLoadDeployedWorkflowState).toHaveBeenCalledWith('wf-history')
    expect(mockLoadLastSuccessfulRunOutputSchema).not.toHaveBeenCalled()
  })

  it('keeps a pasted schema when the deployed workflow declares nothing', async () => {
    mockLoadDeployedWorkflowState.mockResolvedValue({
      blocks: { start: { type: 'start_trigger', subBlocks: {} } },
    })
    const pasted = [{ name: 'items', type: 'array' }]

    const refreshed = await refreshWorkflowBindingOutputSchemas([
      workflowBinding({ outputSchema: pasted }),
    ])

    expect(refreshed[0]?.outputSchema).toEqual(pasted)
  })

  it('keeps a sample-sourced schema instead of the deployed snapshot', async () => {
    mockLoadDeployedWorkflowState.mockResolvedValue({
      blocks: {
        respond: {
          type: 'response',
          subBlocks: {
            builderData: {
              value: [{ name: 'run_data', type: 'object' }],
            },
          },
        },
      },
    })
    const pasted = [
      { name: 'run_data', type: 'object' },
      { name: 'run_data.history', type: 'array' },
      { name: 'run_data.history[].input.keyword', type: 'string' },
    ]

    const refreshed = await refreshWorkflowBindingOutputSchemas([
      workflowBinding({ outputSchema: pasted, outputSchemaSource: 'sample' }),
    ])

    expect(refreshed[0]?.outputSchema).toEqual(pasted)
    expect(refreshed[0]?.outputSchemaSource).toBe('sample')
    expect(mockLoadDeployedWorkflowState).not.toHaveBeenCalled()
  })

  it('still refreshes a sibling binding that did not come from a sample', async () => {
    mockLoadDeployedWorkflowState.mockResolvedValue({
      blocks: {
        respond: {
          type: 'response',
          subBlocks: {
            builderData: { value: [{ name: 'items', type: 'array', value: [] }] },
          },
        },
      },
    })
    const pasted = [{ name: 'run_data.history', type: 'array' }]

    const refreshed = await refreshWorkflowBindingOutputSchemas([
      workflowBinding({ outputSchema: pasted, outputSchemaSource: 'sample' }),
      workflowBinding({
        key: 'run_history_again',
        outputSchema: [{ name: 'history', type: 'array' }],
      }),
    ])

    expect(refreshed[0]?.outputSchema).toEqual(pasted)
    expect(refreshed[1]?.outputSchema).toEqual([{ name: 'items', type: 'array' }])
    expect(mockLoadDeployedWorkflowState).toHaveBeenCalledTimes(1)
  })

  it('keeps HTTP bindings and undeployed workflows unchanged', async () => {
    mockLoadDeployedWorkflowState.mockRejectedValue(new Error('no active deployment'))
    const http: ArenaGenerativeApiBinding = {
      key: 'lookup',
      label: 'Lookup',
      kind: 'http',
      http: { method: 'POST', url: 'https://api.example.com' },
      outputSchema: [{ name: 'score', type: 'number' }],
    }
    const workflow = workflowBinding({ outputSchema: [{ name: 'items', type: 'array' }] })

    await expect(refreshWorkflowBindingOutputSchemas([http, workflow])).resolves.toEqual([
      http,
      workflow,
    ])
    expect(mockLoadDeployedWorkflowState).toHaveBeenCalledTimes(1)
  })

  it('loads each workflow once when two bindings share it', async () => {
    mockLoadDeployedWorkflowState.mockResolvedValue({
      blocks: {
        respond: {
          type: 'response',
          subBlocks: {
            builderData: { value: [{ name: 'items', type: 'array', value: [] }] },
          },
        },
      },
    })

    const refreshed = await refreshWorkflowBindingOutputSchemas([
      workflowBinding({ key: 'run_history' }),
      workflowBinding({ key: 'run_history_again' }),
    ])

    expect(mockLoadDeployedWorkflowState).toHaveBeenCalledTimes(1)
    expect(refreshed.map((binding) => binding.outputSchema)).toEqual([
      [{ name: 'items', type: 'array' }],
      [{ name: 'items', type: 'array' }],
    ])
  })

  it('fills a stub Response from the last successful run and keeps warnings', async () => {
    mockLoadDeployedWorkflowState.mockResolvedValue({
      deploymentVersionId: 'deploy-current',
      blocks: {
        respond: {
          type: 'response',
          subBlocks: {
            builderData: { value: [{ name: 'run_data', type: 'object' }] },
          },
        },
      },
    })
    const lastRunFields = [
      { name: 'run_data', type: 'object' },
      { name: 'run_data.history', type: 'array' },
      { name: 'run_data.history[].input.keyword', type: 'string' },
    ]
    mockLoadLastSuccessfulRunOutputSchema.mockResolvedValue({
      fields: lastRunFields,
      warnings: ['Schema is from a run of an older deployment.'],
      found: true,
    })

    const refreshed = await refreshWorkflowBindingOutputSchemas([
      workflowBinding({
        outputSchema: [{ name: 'run_data', type: 'object' }],
        outputSchemaWarnings: ['stale leftover'],
      }),
    ])

    expect(refreshed[0]?.outputSchema).toEqual(lastRunFields)
    expect(refreshed[0]?.outputSchemaWarnings).toEqual([
      'Schema is from a run of an older deployment.',
    ])
    expect(mockLoadLastSuccessfulRunOutputSchema).toHaveBeenCalledWith('wf-history', {
      activeDeploymentVersionId: 'deploy-current',
    })
  })

  it('clears last-run warnings when the deployed schema is nested', async () => {
    mockLoadDeployedWorkflowState.mockResolvedValue({
      deploymentVersionId: 'deploy-current',
      blocks: {
        respond: {
          type: 'response',
          subBlocks: {
            builderData: {
              value: [
                {
                  name: 'items',
                  type: 'array',
                  value: [
                    {
                      type: 'object',
                      value: [
                        { name: 'keyword', type: 'string', value: '' },
                        { name: 'client', type: 'string', value: '' },
                      ],
                    },
                  ],
                },
              ],
            },
          },
        },
      },
    })

    const refreshed = await refreshWorkflowBindingOutputSchemas([
      workflowBinding({
        outputSchema: [{ name: 'run_data', type: 'object' }],
        outputSchemaWarnings: ['Schema is from a run of an older deployment.'],
      }),
    ])

    expect(refreshed[0]?.outputSchema).toEqual(HISTORY_FIELDS)
    expect(refreshed[0]?.outputSchemaWarnings).toBeUndefined()
    expect(mockLoadLastSuccessfulRunOutputSchema).not.toHaveBeenCalled()
  })

  it('uses the last successful run when the workflow is not deployed', async () => {
    mockLoadDeployedWorkflowState.mockRejectedValue(new Error('no active deployment'))
    const lastRunFields = [
      { name: 'run_data', type: 'object' },
      { name: 'run_data.history', type: 'array' },
    ]
    mockLoadLastSuccessfulRunOutputSchema.mockResolvedValue({
      fields: lastRunFields,
      warnings: [],
      found: true,
    })

    const refreshed = await refreshWorkflowBindingOutputSchemas([workflowBinding()])

    expect(refreshed[0]?.outputSchema).toEqual(lastRunFields)
    expect(mockLoadLastSuccessfulRunOutputSchema).toHaveBeenCalledWith('wf-history', {
      activeDeploymentVersionId: null,
    })
  })
})

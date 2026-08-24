/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockLoadDeployedWorkflowState } = vi.hoisted(() => ({
  mockLoadDeployedWorkflowState: vi.fn(),
}))

vi.mock('@/lib/workflows/persistence/utils', () => ({
  loadDeployedWorkflowState: mockLoadDeployedWorkflowState,
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
      workflowBinding({ key: 'run_history_again', outputSchema: [{ name: 'history', type: 'array' }] }),
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
})

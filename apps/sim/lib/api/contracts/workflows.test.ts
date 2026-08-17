import { describe, expect, it } from 'vitest'
import {
  executeWorkflowBodySchema,
  getWorkflowResponseDataSchema,
  updateWorkflowBodySchema,
  workflowListItemSchema,
} from '@/lib/api/contracts/workflows'
import { PRIVATE_SECRET_PROVENANCE_FIELD } from '@/lib/execution/private-tool-metadata'

describe('workflow contracts', () => {
  /**
   * Agent-event frames are additive to an existing wire format, so an
   * integration that never asked for them must keep the frame set it has.
   */
  it('leaves agent-event exposure off when the caller does not ask for it', () => {
    const parsed = executeWorkflowBodySchema.parse({ stream: true })

    expect(parsed.includeThinking).toBe(false)
    expect(parsed.includeToolCalls).toBe(false)
  })

  it('accepts each agent-event policy independently', () => {
    expect(executeWorkflowBodySchema.parse({ stream: true, includeToolCalls: true })).toMatchObject(
      { includeThinking: false, includeToolCalls: true }
    )

    expect(executeWorkflowBodySchema.parse({ stream: true, includeThinking: true })).toMatchObject({
      includeThinking: true,
      includeToolCalls: false,
    })
  })

  it('accepts a trusted prior-execution input reference', () => {
    expect(
      executeWorkflowBodySchema.parse({ inputFromExecutionId: 'execution-123' })
    ).toMatchObject({ inputFromExecutionId: 'execution-123' })
  })

  it('retains a private workflow-input provenance envelope for boundary validation', () => {
    const bundle = {
      version: 1 as const,
      complete: true,
      selections: [
        {
          key: 'input',
          provenance: {
            version: 1 as const,
            complete: true,
            entries: [{ name: 'TOKEN', encryptedValue: 'encrypted-token' }],
            scope: { userId: 'parent-owner', workspaceId: 'workspace-1' },
          },
        },
      ],
    }

    expect(
      executeWorkflowBodySchema.parse({ [PRIVATE_SECRET_PROVENANCE_FIELD]: bundle })
    ).toMatchObject({ [PRIVATE_SECRET_PROVENANCE_FIELD]: bundle })
  })

  it('normalizes null React Flow edge handles in execution overrides', () => {
    const parsed = executeWorkflowBodySchema.parse({
      workflowStateOverride: {
        blocks: {
          source: {
            id: 'source',
            type: 'start_trigger',
            name: 'Start',
            position: { x: 0, y: 0 },
            subBlocks: {},
            outputs: {},
            enabled: true,
          },
          target: {
            id: 'target',
            type: 'function',
            name: 'Function',
            position: { x: 100, y: 0 },
            subBlocks: {},
            outputs: {},
            enabled: true,
          },
        },
        edges: [
          {
            id: 'edge-1',
            source: 'source',
            target: 'target',
            sourceHandle: null,
            targetHandle: null,
            type: 'workflowEdge',
          },
        ],
        loops: {},
        parallels: {},
      },
    })

    expect(parsed.workflowStateOverride?.edges[0].sourceHandle).toBeUndefined()
    expect(parsed.workflowStateOverride?.edges[0].targetHandle).toBeUndefined()
  })

  it('normalizes null optional block booleans in workflow GET responses', () => {
    const parsed = getWorkflowResponseDataSchema.parse({
      id: 'workflow-1',
      userId: 'user-1',
      workspaceId: 'workspace-1',
      folderId: null,
      sortOrder: 0,
      name: 'Test workflow',
      description: null,
      lastSynced: '2026-01-01T00:00:00.000Z',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      isDeployed: false,
      deployedAt: null,
      isPublicApi: false,
      locked: false,
      runCount: 0,
      lastRunAt: null,
      archivedAt: null,
      state: {
        blocks: {
          'block-1': {
            id: 'block-1',
            type: 'agent',
            name: 'Agent',
            position: { x: 0, y: 0 },
            subBlocks: {},
            outputs: {},
            enabled: true,
            triggerMode: null,
            advancedMode: null,
            horizontalHandles: null,
            locked: null,
          },
        },
        edges: [],
        loops: {},
        parallels: {},
      },
    })

    expect(parsed.state.blocks['block-1'].triggerMode).toBeUndefined()
    expect(parsed.state.blocks['block-1'].advancedMode).toBeUndefined()
    expect(parsed.state.blocks['block-1'].horizontalHandles).toBeUndefined()
    expect(parsed.state.blocks['block-1'].locked).toBeUndefined()
  })

  it('updateWorkflowBodySchema accepts forkSyncExcluded and leaves it optional', () => {
    expect(updateWorkflowBodySchema.parse({ forkSyncExcluded: true }).forkSyncExcluded).toBe(true)
    expect(updateWorkflowBodySchema.parse({}).forkSyncExcluded).toBeUndefined()
  })

  it('workflowListItemSchema defaults an absent forkSyncExcluded to false (old-server tolerance)', () => {
    const item = workflowListItemSchema.parse({
      id: 'wf-1',
      name: 'Alpha',
      description: null,
      workspaceId: 'ws-1',
      folderId: null,
      sortOrder: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      archivedAt: null,
      locked: false,
    })
    expect(item.forkSyncExcluded).toBe(false)
  })
})

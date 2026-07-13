/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockRequestJson,
  mockApplyWorkflowStateToStores,
  mockPersistWorkflowStateToServer,
  mockGetRegistryState,
  mockHasPendingOperations,
  mockGetOperationQueueState,
  mockGetWorkflowDiffState,
  mockGetWorkflowState,
  mockReplaceWorkflowState,
  mockMergeSubblockState,
} = vi.hoisted(() => ({
  mockRequestJson: vi.fn(),
  mockApplyWorkflowStateToStores: vi.fn(),
  mockPersistWorkflowStateToServer: vi.fn(),
  mockGetRegistryState: vi.fn(() => ({ activeWorkflowId: 'workflow-a' })),
  mockHasPendingOperations: vi.fn(() => false),
  mockGetOperationQueueState: vi.fn(() => ({
    hasPendingOperations: mockHasPendingOperations,
    workflowOperationVersions: {},
  })),
  mockGetWorkflowDiffState: vi.fn(() => ({
    hasActiveDiff: false,
    pendingExternalUpdates: {},
    reconcilingWorkflows: {},
    reconciliationErrors: {},
    remoteUpdateVersions: {},
  })),
  mockGetWorkflowState: vi.fn(),
  mockReplaceWorkflowState: vi.fn(),
  mockMergeSubblockState: vi.fn(),
}))

vi.mock('@/lib/api/client/request', () => ({
  requestJson: mockRequestJson,
}))

vi.mock('@/lib/api/contracts', () => ({
  getWorkflowStateContract: {},
}))

vi.mock('@/stores/workflow-diff/utils', () => ({
  applyWorkflowStateToStores: mockApplyWorkflowStateToStores,
  persistWorkflowStateToServer: mockPersistWorkflowStateToServer,
}))

vi.mock('@/stores/workflow-diff/store', () => ({
  useWorkflowDiffStore: {
    getState: mockGetWorkflowDiffState,
  },
}))

vi.mock('@/stores/operation-queue/store', () => ({
  useOperationQueueStore: {
    getState: mockGetOperationQueueState,
  },
}))

vi.mock('@/stores/workflows/registry/store', () => ({
  useWorkflowRegistry: {
    getState: mockGetRegistryState,
  },
}))

vi.mock('@/stores/workflows/utils', () => ({
  mergeSubblockState: mockMergeSubblockState,
}))

vi.mock('@/stores/workflows/workflow/store', () => ({
  useWorkflowStore: {
    getState: () => ({
      getWorkflowState: mockGetWorkflowState,
      replaceWorkflowState: mockReplaceWorkflowState,
    }),
  },
}))

import {
  flushMergedLocalDraftToServer,
  syncLocalDraftFromServer,
} from '@/app/workspace/[workspaceId]/w/[workflowId]/components/panel/components/deploy/hooks/sync-local-draft'

describe('flushMergedLocalDraftToServer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRegistryState.mockReturnValue({ activeWorkflowId: 'workflow-a' })
    mockGetWorkflowState.mockReturnValue({
      blocks: {
        'block-1': {
          id: 'block-1',
          type: 'image_generator_v2',
          name: 'Image 1',
          subBlocks: {
            provider: { id: 'provider', type: 'combobox', value: '' },
          },
        },
      },
      edges: [],
      loops: {},
      parallels: {},
    })
    mockMergeSubblockState.mockImplementation((blocks) => ({
      ...blocks,
      'block-1': {
        ...blocks['block-1'],
        subBlocks: {
          provider: { id: 'provider', type: 'combobox', value: 'gemini' },
        },
      },
    }))
    mockPersistWorkflowStateToServer.mockResolvedValue(true)
  })

  it('persists merged subblock values before deployment', async () => {
    await expect(flushMergedLocalDraftToServer('workflow-a')).resolves.toBe(true)

    expect(mockReplaceWorkflowState).toHaveBeenCalledWith(
      expect.objectContaining({
        blocks: {
          'block-1': expect.objectContaining({
            subBlocks: {
              provider: { id: 'provider', type: 'combobox', value: 'gemini' },
            },
          }),
        },
      })
    )
    expect(mockPersistWorkflowStateToServer).toHaveBeenCalledWith(
      'workflow-a',
      expect.objectContaining({
        blocks: {
          'block-1': expect.objectContaining({
            subBlocks: {
              provider: { id: 'provider', type: 'combobox', value: 'gemini' },
            },
          }),
        },
      })
    )
  })

  it('skips persistence when workflow blocks already match the subblock store', async () => {
    mockMergeSubblockState.mockImplementation((blocks) => blocks)

    await expect(flushMergedLocalDraftToServer('workflow-a')).resolves.toBe(true)

    expect(mockReplaceWorkflowState).not.toHaveBeenCalled()
    expect(mockPersistWorkflowStateToServer).not.toHaveBeenCalled()
  })
})

describe('syncLocalDraftFromServer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetRegistryState.mockReturnValue({ activeWorkflowId: 'workflow-a' })
    mockHasPendingOperations.mockReturnValue(false)
    mockGetOperationQueueState.mockImplementation(() => ({
      hasPendingOperations: mockHasPendingOperations,
      workflowOperationVersions: {},
    }))
    mockGetWorkflowDiffState.mockReturnValue({
      hasActiveDiff: false,
      pendingExternalUpdates: {},
      reconcilingWorkflows: {},
      reconciliationErrors: {},
      remoteUpdateVersions: {},
    })
  })

  it('hydrates sibling workflow variables into the applied workflow state', async () => {
    mockRequestJson.mockResolvedValue({
      data: {
        state: {
          blocks: {},
          edges: [],
          loops: {},
          parallels: {},
          lastSaved: 1,
        },
        variables: {
          'variable-a': {
            id: 'variable-a',
            name: 'API_KEY',
            type: 'plain',
            value: 'secret',
          },
        },
      },
    })

    await expect(syncLocalDraftFromServer('workflow-a')).resolves.toBe(true)

    expect(mockApplyWorkflowStateToStores).toHaveBeenCalledWith(
      'workflow-a',
      expect.objectContaining({
        variables: {
          'variable-a': {
            id: 'variable-a',
            name: 'API_KEY',
            type: 'plain',
            value: 'secret',
          },
        },
      }),
      { updateLastSaved: true }
    )
  })

  it('does not apply a fetched draft after navigation changes the active workflow', async () => {
    mockGetRegistryState
      .mockReturnValueOnce({ activeWorkflowId: 'workflow-a' })
      .mockReturnValueOnce({ activeWorkflowId: 'workflow-b' })
    mockRequestJson.mockResolvedValue({
      data: {
        state: {
          blocks: {},
          edges: [],
          loops: {},
          parallels: {},
          lastSaved: 1,
        },
        variables: {},
      },
    })

    await expect(syncLocalDraftFromServer('workflow-a')).resolves.toBe(false)

    expect(mockApplyWorkflowStateToStores).not.toHaveBeenCalled()
  })

  it('does not synthesize an empty variables object when the server omits variables', async () => {
    mockRequestJson.mockResolvedValue({
      data: {
        state: {
          blocks: {},
          edges: [],
          loops: {},
          parallels: {},
          lastSaved: 1,
        },
      },
    })

    await expect(syncLocalDraftFromServer('workflow-a')).resolves.toBe(true)

    const appliedState = mockApplyWorkflowStateToStores.mock.calls[0][1]
    expect(Object.hasOwn(appliedState, 'variables')).toBe(false)
  })

  it('does not apply a fetched draft over newly queued local operations', async () => {
    mockHasPendingOperations.mockReturnValueOnce(false).mockReturnValueOnce(true)
    mockRequestJson.mockResolvedValue({
      data: {
        state: {
          blocks: {},
          edges: [],
          loops: {},
          parallels: {},
          lastSaved: 1,
        },
        variables: {},
      },
    })

    await expect(syncLocalDraftFromServer('workflow-a')).resolves.toBe(false)

    expect(mockApplyWorkflowStateToStores).not.toHaveBeenCalled()
  })

  it('does not apply a fetched draft when a newer remote update arrives during fetch', async () => {
    mockGetWorkflowDiffState
      .mockReturnValueOnce({
        hasActiveDiff: false,
        pendingExternalUpdates: {},
        reconcilingWorkflows: {},
        reconciliationErrors: {},
        remoteUpdateVersions: {},
      })
      .mockReturnValueOnce({
        hasActiveDiff: false,
        pendingExternalUpdates: {},
        reconcilingWorkflows: {},
        reconciliationErrors: {},
        remoteUpdateVersions: { 'workflow-a': 1 },
      })
    mockRequestJson.mockResolvedValue({
      data: {
        state: {
          blocks: {},
          edges: [],
          loops: {},
          parallels: {},
          lastSaved: 1,
        },
        variables: {},
      },
    })

    await expect(syncLocalDraftFromServer('workflow-a')).resolves.toBe(false)

    expect(mockApplyWorkflowStateToStores).not.toHaveBeenCalled()
  })

  it('does not apply a fetched draft when local operations queue and drain during fetch', async () => {
    mockGetOperationQueueState
      .mockReturnValueOnce({
        hasPendingOperations: mockHasPendingOperations,
        workflowOperationVersions: {},
      })
      .mockReturnValueOnce({
        hasPendingOperations: mockHasPendingOperations,
        workflowOperationVersions: {},
      })
      .mockReturnValueOnce({
        hasPendingOperations: mockHasPendingOperations,
        workflowOperationVersions: { 'workflow-a': 1 },
      })
    mockRequestJson.mockResolvedValue({
      data: {
        state: {
          blocks: {},
          edges: [],
          loops: {},
          parallels: {},
          lastSaved: 1,
        },
        variables: {},
      },
    })

    await expect(syncLocalDraftFromServer('workflow-a')).resolves.toBe(false)

    expect(mockApplyWorkflowStateToStores).not.toHaveBeenCalled()
  })
})

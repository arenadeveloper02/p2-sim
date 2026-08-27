/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DAG } from '@/executor/dag/builder'
import type { BlockStateController } from '@/executor/execution/types'
import { LoopOrchestratorV2 } from '@/executor/orchestrators/loop-v2'
import type { ExecutionContext } from '@/executor/types'
import { ResolvedSecretTraceRegistry } from '@/executor/utils/resolved-secret-trace-registry'

vi.mock('@/lib/execution/isolated-vm', () => ({
  executeInIsolatedVM: vi.fn(),
}))

vi.mock('@/lib/uploads', () => ({
  StorageService: {
    uploadFile: vi.fn(),
  },
}))

function createState(): BlockStateController {
  return {
    getBlockState: vi.fn(),
    getBlockOutput: vi.fn(),
    hasExecuted: vi.fn(() => false),
    setBlockOutput: vi.fn(),
    setBlockState: vi.fn(),
    deleteBlockState: vi.fn(),
    unmarkExecuted: vi.fn(),
  }
}

function createContext(): ExecutionContext {
  return {
    workflowId: 'workflow-1',
    workspaceId: 'workspace-1',
    executionId: 'execution-1',
    userId: 'user-1',
    blockStates: new Map(),
    executedBlocks: new Set(),
    blockLogs: [],
    metadata: { requestId: 'request-1' },
    environmentVariables: {},
    workflowVariables: {},
    decisions: { router: new Map(), condition: new Map() },
    completedLoops: new Set(),
    activeExecutionPath: new Set(),
    loopExecutions: new Map(),
  } as ExecutionContext
}

describe('LoopOrchestratorV2 forEach provenance', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves forEach collections with forEachItems inputPath on a forked registry', async () => {
    const loopId = 'loop-1'
    const dag: DAG = {
      nodes: new Map(),
      loopConfigs: new Map([
        [
          loopId,
          {
            id: loopId,
            nodes: ['task-1'],
            loopType: 'forEach',
            forEachItems: '<Producer.items>',
          },
        ],
      ]),
      parallelConfigs: new Map(),
    }
    const resolver = {
      resolveSingleReference: vi.fn().mockResolvedValue(['item-1']),
    }
    const orchestrator = new LoopOrchestratorV2(dag, createState(), resolver as any)
    const ctx = createContext()
    ctx.resolvedSecretTraceRegistry = new ResolvedSecretTraceRegistry([])

    const scope = await orchestrator.initializeLoopScope(ctx, loopId)

    expect(resolver.resolveSingleReference).toHaveBeenCalledWith(
      expect.objectContaining({
        resolvedSecretTraceRegistry: expect.any(ResolvedSecretTraceRegistry),
      }),
      'loop-loop-1-sentinel-start',
      '<Producer.items>',
      undefined,
      { allowLargeValueRefs: true, inputPath: ['forEachItems'] }
    )
    expect(scope.maxIterations).toBe(1)
    expect(scope.inputResolvedSecretTraceProvenance?.complete).toBe(true)
    expect(ctx.resolvedSecretTraceRegistry?.isComplete()).toBe(true)
  })

  it('keeps the parent registry complete when forEach collection provenance is incomplete', async () => {
    const loopId = 'loop-1'
    const dag: DAG = {
      nodes: new Map(),
      loopConfigs: new Map([
        [
          loopId,
          {
            id: loopId,
            nodes: ['agent-1'],
            loopType: 'forEach',
            forEachItems: '<Function.result>',
          },
        ],
      ]),
      parallelConfigs: new Map(),
    }
    const resolver = {
      resolveSingleReference: vi.fn().mockImplementation(async (resolutionContext) => {
        const items = ['alpha', 'beta']
        // Mimic BlockResolver importing incomplete Function output provenance
        // (e.g. Function had an incomplete input path) onto the forEach collection.
        await resolutionContext.resolvedSecretTraceRegistry?.importProvenanceForValueAtInputPath(
          { version: 1, complete: false, entries: [] },
          items,
          ['forEachItems'],
          { trusted: true, origin: 'blockResolver.outputCrossing' }
        )
        return items
      }),
    }
    const orchestrator = new LoopOrchestratorV2(dag, createState(), resolver as any)
    const ctx = createContext()
    const parentRegistry = new ResolvedSecretTraceRegistry([])
    ctx.resolvedSecretTraceRegistry = parentRegistry

    const scope = await orchestrator.initializeLoopScope(ctx, loopId)

    expect(scope.items).toEqual(['alpha', 'beta'])
    expect(scope.maxIterations).toBe(2)
    expect(scope.inputResolvedSecretTraceProvenance).toBeUndefined()
    expect(parentRegistry.isComplete()).toBe(true)
    expect(parentRegistry.isPermanentlyIncomplete()).toBe(false)
  })
})

import '@sim/testing/mocks/executor'

import { authOAuthUtilsMock, authOAuthUtilsMockFns } from '@sim/testing'
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest'

vi.mock('@/app/api/auth/oauth/utils', () => authOAuthUtilsMock)

vi.mock('@sim/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => []),
        })),
      })),
    })),
  },
}))

import { BlockType } from '@/executor/constants'
import { GraphGeneratorBlockHandler } from '@/executor/handlers/graph-generator/graph-generator-handler'
import type { ExecutionContext } from '@/executor/types'
import { getProviderFromModel } from '@/providers/utils'
import type { SerializedBlock } from '@/serializer/types'

const mockGetProviderFromModel = getProviderFromModel as Mock
const mockFetch = global.fetch as unknown as Mock

describe('GraphGeneratorBlockHandler', () => {
  let handler: GraphGeneratorBlockHandler
  let mockBlock: SerializedBlock
  let mockContext: ExecutionContext

  beforeEach(() => {
    handler = new GraphGeneratorBlockHandler()

    mockBlock = {
      id: 'graph-block-1',
      metadata: { id: BlockType.GRAPH_GENERATOR, name: 'Graph Generator' },
      position: { x: 20, y: 20 },
      config: { tool: BlockType.GRAPH_GENERATOR, params: {} },
      inputs: {
        userInput: 'string',
        data: 'json',
        model: 'string',
      },
      outputs: {},
      enabled: true,
    }

    mockContext = {
      workflowId: 'test-workflow-id',
      userId: 'test-user',
      blockStates: new Map(),
      blockLogs: [],
      metadata: { duration: 0 },
      environmentVariables: {},
      decisions: { router: new Map(), condition: new Map() },
      loopExecutions: new Map(),
      completedLoops: new Set(),
      executedBlocks: new Set(),
      activeExecutionPath: new Set(),
    }

    vi.clearAllMocks()

    authOAuthUtilsMockFns.mockResolveOAuthAccountId.mockResolvedValue({
      accountId: 'test-vertex-credential-id',
      usedCredentialTable: false,
    })
    authOAuthUtilsMockFns.mockRefreshTokenIfNeeded.mockResolvedValue({
      accessToken: 'mock-access-token',
      refreshed: false,
    })

    mockGetProviderFromModel.mockReturnValue('openai')
  })

  it('should handle graph generator blocks', () => {
    expect(handler.canHandle(mockBlock)).toBe(true)
    expect(handler.canHandle({ ...mockBlock, metadata: { id: BlockType.AGENT, name: 'Agent' } })).toBe(
      false
    )
  })

  it('returns normalized chart output from a single option response', async () => {
    const chartOption = {
      title: { text: 'CTR by campaign' },
      xAxis: { type: 'category', data: ['A', 'B'] },
      yAxis: { type: 'value' },
      series: [{ type: 'bar', data: [1, 2] }],
    }

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: JSON.stringify(chartOption),
        model: 'gpt-4o',
        tokens: { input: 10, output: 20, total: 30 },
      }),
    })

    const result = await handler.execute(mockContext, mockBlock, {
      userInput: 'Show CTR by campaign',
      data: [{ campaign: 'A', ctr: 0.1 }],
      model: 'gpt-4o',
    })

    expect(result.count).toBe(1)
    expect(result.charts).toEqual([chartOption])
    expect(result.content).toBe(JSON.stringify({ charts: [chartOption], count: 1 }))
    expect(result.model).toBe('gpt-4o')
  })

  it('returns plain-text content when the model response is not chart JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        content: 'No chartable data is available.',
        model: 'gpt-4o',
        tokens: { input: 5, output: 8, total: 13 },
      }),
    })

    const result = await handler.execute(mockContext, mockBlock, {
      userInput: 'Graph this',
      data: '',
      model: 'gpt-4o',
    })

    expect(result.count).toBe(0)
    expect(result.charts).toEqual([])
    expect(result.content).toBe('No chartable data is available.')
  })
})

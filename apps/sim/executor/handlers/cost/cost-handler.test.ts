/**
 * @vitest-environment node
 */
import '@sim/testing/mocks/executor'

import { beforeEach, describe, expect, it } from 'vitest'
import { BlockType } from '@/executor/constants'
import { CostBlockHandler } from '@/executor/handlers/cost/cost-handler'
import type { ExecutionContext } from '@/executor/types'
import type { SerializedBlock } from '@/serializer/types'

describe('CostBlockHandler', () => {
  let handler: CostBlockHandler
  let mockBlock: SerializedBlock
  let mockContext: ExecutionContext

  beforeEach(() => {
    handler = new CostBlockHandler()

    mockBlock = {
      id: 'cost-block-1',
      metadata: { id: BlockType.COST, name: 'Cost' },
      position: { x: 0, y: 0 },
      config: { tool: BlockType.COST, params: {} },
      inputs: {},
      outputs: {},
      enabled: true,
    }

    mockContext = {
      workflowId: 'workflow-1',
      blockStates: new Map(),
      blockLogs: [],
      metadata: { duration: 0 },
      environmentVariables: {},
      decisions: { router: new Map(), condition: new Map() },
      loopExecutions: new Map(),
      completedLoops: new Set(),
      executedBlocks: new Set(),
      activeExecutionPath: new Set(),
      workflow: {
        blocks: [
          {
            id: 'api-block-1',
            metadata: { id: BlockType.API, name: 'API' },
            position: { x: 0, y: 0 },
            config: { tool: BlockType.API, params: {} },
            inputs: {},
            outputs: {},
            enabled: true,
          },
        ],
        connections: [],
      },
    }
  })

  it('should handle cost blocks only', () => {
    expect(handler.canHandle(mockBlock)).toBe(true)
    expect(handler.canHandle({ ...mockBlock, metadata: { id: BlockType.API } })).toBe(false)
  })

  it('records a fixed USD amount', async () => {
    const result = await handler.execute(mockContext, mockBlock, {
      mode: 'fixed',
      amount: '0.05',
      currency: 'USD',
      vendor: 'Custom API',
    })

    expect(result).toMatchObject({
      cost: { total: 0.05, input: 0, output: 0 },
      raw: {
        amount: 0.05,
        currency: 'USD',
        vendor: 'Custom API',
        label: 'Custom API',
        source: 'fixed',
      },
      recorded: true,
    })
  })

  it('converts non-USD amounts using the exchange rate', async () => {
    const result = await handler.execute(mockContext, mockBlock, {
      mode: 'fixed',
      amount: 10,
      currency: 'EUR',
      exchangeRate: 1.1,
      vendor: 'Partner',
    })

    expect(result.cost).toEqual({ total: 11, input: 0, output: 0 })
    expect(result.raw).toMatchObject({
      amount: 10,
      currency: 'EUR',
      exchangeRate: 1.1,
    })
    expect(result.recorded).toBe(true)
  })

  it('requires an exchange rate for non-USD currency', async () => {
    await expect(
      handler.execute(mockContext, mockBlock, {
        mode: 'fixed',
        amount: 10,
        currency: 'EUR',
      })
    ).rejects.toThrow('Exchange rate is required when currency is EUR')
  })

  it('resolves expression mode from a resolved numeric input', async () => {
    const result = await handler.execute(mockContext, mockBlock, {
      mode: 'expression',
      amountExpression: 0.25,
      currency: 'USD',
    })

    expect(result.cost).toEqual({ total: 0.25, input: 0, output: 0 })
    expect(result.recorded).toBe(true)
  })

  it('reads response path values from an upstream block output', async () => {
    mockContext.blockStates.set('api-block-1', {
      output: {
        data: { billing: { amount: 0.42 } },
        status: 200,
      },
      executed: true,
      executionTime: 1,
    })

    const result = await handler.execute(mockContext, mockBlock, {
      mode: 'response_path',
      sourceBlock: 'API',
      responsePath: 'data.billing.amount',
      currency: 'USD',
      vendor: 'Partner API',
    })

    expect(result.cost).toEqual({ total: 0.42, input: 0, output: 0 })
    expect(result.passthrough).toEqual({
      data: { billing: { amount: 0.42 } },
      status: 200,
    })
    expect(result.recorded).toBe(true)
  })

  it('skips recording when disabled', async () => {
    const result = await handler.execute(mockContext, mockBlock, {
      enabled: false,
      mode: 'fixed',
      amount: 1,
      currency: 'USD',
    })

    expect(result.cost).toEqual({ total: 0, input: 0, output: 0 })
    expect(result.recorded).toBe(false)
  })

  it('skips recording when skipIfZero is enabled and amount resolves to zero', async () => {
    const result = await handler.execute(mockContext, mockBlock, {
      mode: 'fixed',
      amount: 0,
      currency: 'USD',
      skipIfZero: true,
    })

    expect(result.cost).toEqual({ total: 0, input: 0, output: 0 })
    expect(result.recorded).toBe(false)
  })

  it('skips recording when onlyOnSuccess is enabled and the source block failed', async () => {
    mockContext.blockLogs.push({
      blockId: 'api-block-1',
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      durationMs: 1,
      success: false,
      error: 'Request failed',
      executionOrder: 1,
    })
    mockContext.blockStates.set('api-block-1', {
      output: { error: 'Request failed' },
      executed: true,
      executionTime: 1,
    })

    const result = await handler.execute(mockContext, mockBlock, {
      mode: 'response_path',
      sourceBlock: 'API',
      responsePath: 'data.cost',
      currency: 'USD',
      onlyOnSuccess: true,
    })

    expect(result.cost).toEqual({ total: 0, input: 0, output: 0 })
    expect(result.recorded).toBe(false)
  })

  it('rejects invalid negative amounts', async () => {
    const result = await handler.execute(mockContext, mockBlock, {
      mode: 'fixed',
      amount: -5,
      currency: 'USD',
    })

    expect(result.cost).toEqual({ total: 0, input: 0, output: 0 })
    expect(result.recorded).toBe(false)
  })
})

/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetHighestPrioritySubscription,
  mockInsert,
  mockIsOrgScopedSubscription,
  mockOnConflictDoNothing,
  mockReturning,
  mockValues,
  mockTransaction,
  mockUpdate,
} = vi.hoisted(() => ({
  mockGetHighestPrioritySubscription: vi.fn(),
  mockInsert: vi.fn(),
  mockIsOrgScopedSubscription: vi.fn(),
  mockOnConflictDoNothing: vi.fn(),
  mockReturning: vi.fn(),
  mockValues: vi.fn(),
  mockTransaction: vi.fn(),
  mockUpdate: vi.fn(),
}))

vi.mock('@sim/db', () => {
  const instance = { insert: mockInsert, transaction: mockTransaction }
  return { db: instance, dbReplica: instance }
})

vi.mock('@sim/db/schema', () => ({
  usageLog: {
    billingEntityId: 'usageLog.billingEntityId',
    billingEntityType: 'usageLog.billingEntityType',
    billingPeriodEnd: 'usageLog.billingPeriodEnd',
    billingPeriodStart: 'usageLog.billingPeriodStart',
    category: 'usageLog.category',
    cost: 'usageLog.cost',
    rawCost: 'usageLog.rawCost',
    billableCost: 'usageLog.billableCost',
    billable: 'usageLog.billable',
    chatId: 'usageLog.chatId',
    runId: 'usageLog.runId',
    vendor: 'usageLog.vendor',
    provider: 'usageLog.provider',
    toolId: 'usageLog.toolId',
    quantity: 'usageLog.quantity',
    unit: 'usageLog.unit',
    pricingSnapshot: 'usageLog.pricingSnapshot',
    occurredAt: 'usageLog.occurredAt',
    createdAt: 'usageLog.createdAt',
    description: 'usageLog.description',
    eventKey: 'usageLog.eventKey',
    executionId: 'usageLog.executionId',
    id: 'usageLog.id',
    metadata: 'usageLog.metadata',
    source: 'usageLog.source',
    userId: 'usageLog.userId',
    workflowId: 'usageLog.workflowId',
    workspaceId: 'usageLog.workspaceId',
  },
}))

vi.mock('@/lib/billing/core/plan', () => ({
  getHighestPrioritySubscription: mockGetHighestPrioritySubscription,
}))

vi.mock('@/lib/billing/subscriptions/utils', () => ({
  isOrgScopedSubscription: mockIsOrgScopedSubscription,
}))

vi.mock('@/lib/core/config/env-flags', () => ({
  isBillingEnabled: true,
}))

import {
  CUMULATIVE_COST_EPSILON,
  recordCumulativeUsage,
  recordUsage,
  resolveCumulativeTopUp,
} from '@/lib/billing/core/usage-log'

describe('recordUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReturning.mockResolvedValue([
      { cost: '0.10', billable: true },
      { cost: '0.20', billable: true },
    ])
    mockOnConflictDoNothing.mockReturnValue({ returning: mockReturning })
    mockValues.mockReturnValue({
      onConflictDoNothing: mockOnConflictDoNothing,
    })
    mockInsert.mockReturnValue({ values: mockValues })
    mockGetHighestPrioritySubscription.mockResolvedValue({
      periodEnd: new Date('2026-06-01T00:00:00.000Z'),
      periodStart: new Date('2026-05-01T00:00:00.000Z'),
      referenceId: 'org-1',
    })
    mockIsOrgScopedSubscription.mockReturnValue(true)
  })

  it('commits canonical usage rows with deterministic event keys and billing scope', async () => {
    await recordUsage({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      workflowId: 'workflow-1',
      executionId: 'execution-1',
      entries: [
        { category: 'fixed', source: 'workflow', description: 'execution_fee', cost: 0.1 },
        {
          category: 'model',
          source: 'workflow',
          description: 'gpt-4',
          cost: 0.2,
          metadata: { inputTokens: 10, outputTokens: 20 },
        },
      ],
    })

    const values = mockValues.mock.calls[0][0]
    expect(values).toHaveLength(2)
    expect(values[0]).toMatchObject({
      billingEntityId: 'org-1',
      billingEntityType: 'organization',
      billingPeriodEnd: new Date('2026-06-01T00:00:00.000Z'),
      billingPeriodStart: new Date('2026-05-01T00:00:00.000Z'),
    })
    expect(values[0].eventKey).toMatch(/^[a-f0-9]{64}$/)
    expect(values[1].eventKey).toMatch(/^[a-f0-9]{64}$/)
    expect(values[0].eventKey).not.toBe(values[1].eventKey)
    expect(values[0]).toMatchObject({
      rawCost: '0.1',
      billableCost: '0.1',
      cost: '0.1',
      billable: true,
    })
    expect(mockOnConflictDoNothing).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'usageLog.eventKey' })
    )
  })

  it('stamps occurredAt from caller when provided', async () => {
    const occurredAt = new Date('2026-01-15T10:00:00.000Z')
    await recordUsage({
      userId: 'user-1',
      occurredAt,
      entries: [{ category: 'fixed', source: 'workflow', description: 'execution_fee', cost: 0.1 }],
    })

    expect(mockValues.mock.calls[0][0][0].occurredAt).toEqual(occurredAt)
  })

  it('uses pre-resolved billing context without loading subscriptions', async () => {
    await recordUsage({
      userId: 'user-1',
      billingEntity: { type: 'user', id: 'user-1' },
      billingPeriod: {
        start: new Date('2026-05-01T00:00:00.000Z'),
        end: new Date('2026-06-01T00:00:00.000Z'),
      },
      entries: [{ category: 'fixed', source: 'workflow', description: 'execution_fee', cost: 0.1 }],
    })

    expect(mockGetHighestPrioritySubscription).not.toHaveBeenCalled()
    expect(mockValues.mock.calls[0][0][0]).toMatchObject({
      billingEntityId: 'user-1',
      billingEntityType: 'user',
    })
  })

  it('inserts zero-cost entries with billable=false and full metadata', async () => {
    mockReturning.mockResolvedValue([{ cost: '0', billable: false }])

    await recordUsage({
      userId: 'user-1',
      workspaceId: 'workspace-1',
      executionId: 'execution-1',
      entries: [
        {
          category: 'model',
          source: 'workflow',
          description: 'gpt-4o',
          cost: 0,
          metadata: { inputTokens: 100, outputTokens: 50 },
        },
      ],
    })

    expect(mockValues.mock.calls[0][0]).toHaveLength(1)
    expect(mockValues.mock.calls[0][0][0]).toMatchObject({
      cost: '0',
      billable: false,
      metadata: { inputTokens: 100, outputTokens: 50 },
    })
  })
})

describe('resolveCumulativeTopUp', () => {
  it('bills the full amount on the first flush (nothing recorded yet)', () => {
    expect(resolveCumulativeTopUp(0, 0.3474447)).toEqual({
      shouldBill: true,
      delta: 0.3474447,
      newTotal: 0.3474447,
    })
  })

  it('bills only the delta when the cumulative grows (recovered request)', () => {
    const result = resolveCumulativeTopUp(0.3474447, 0.4662453)
    expect(result.shouldBill).toBe(true)
    expect(result.newTotal).toBe(0.4662453)
    expect(result.delta).toBeCloseTo(0.1188006, 9)
  })

  it('is a no-op when the cumulative is unchanged (abort-race duplicate)', () => {
    expect(resolveCumulativeTopUp(0.4662453, 0.4662453)).toEqual({
      shouldBill: false,
      delta: 0,
      newTotal: 0.4662453,
    })
  })

  it('is a no-op when an out-of-order flush carries a lower cumulative', () => {
    expect(resolveCumulativeTopUp(0.4662453, 0.3)).toMatchObject({ shouldBill: false, delta: 0 })
  })

  it('ignores sub-epsilon increases from decimal round-trips', () => {
    expect(
      resolveCumulativeTopUp(0.4662453, 0.4662453 + CUMULATIVE_COST_EPSILON / 2)
    ).toMatchObject({ shouldBill: false })
  })
})

describe('recordCumulativeUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReturning.mockResolvedValue([{ cost: '0.3474447', billable: true }])
    mockOnConflictDoNothing.mockReturnValue({ returning: mockReturning })
    mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing })
    mockInsert.mockReturnValue({ values: mockValues })
    mockGetHighestPrioritySubscription.mockResolvedValue({
      periodEnd: new Date('2026-06-01T00:00:00.000Z'),
      periodStart: new Date('2026-05-01T00:00:00.000Z'),
      referenceId: 'org-1',
    })
    mockIsOrgScopedSubscription.mockReturnValue(true)
  })

  const setupTx = (existingRow: { id: string; cost: string; rawCost?: string } | null) => {
    const limit = vi.fn().mockResolvedValue(existingRow ? [existingRow] : [])
    const where = vi.fn().mockReturnValue({ limit })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })
    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
    mockUpdate.mockReturnValue({ set: updateSet })
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select,
      update: mockUpdate,
      insert: mockInsert, // recordUsage(tx) reuses the shared insert chain
    }
    mockTransaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx))
    return { tx, select, updateSet }
  }

  /** True when any tx.execute call ran a sql`` template containing the substring. */
  const executedSqlContaining = (tx: { execute: ReturnType<typeof vi.fn> }, substring: string) =>
    tx.execute.mock.calls.some(([arg]) => {
      const strings = (arg as { strings?: readonly string[] } | null)?.strings
      return Array.isArray(strings) && strings.some((s) => s.includes(substring))
    })

  it('inserts the full cumulative on the first flush', async () => {
    setupTx(null)
    const result = await recordCumulativeUsage({
      userId: 'user-1',
      workspaceId: 'ws-1',
      source: 'workspace-chat',
      model: 'claude-opus-4.8',
      cost: 0.3474447,
      eventKey: 'update-cost:msg-1-billing',
      metadata: { inputTokens: 100, outputTokens: 5 },
    })
    expect(result).toEqual({ billed: true, delta: 0.3474447, total: 0.3474447 })
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('tops up to the higher cumulative and bills only the delta', async () => {
    const { updateSet } = setupTx({ id: 'row-1', cost: '0.3474447' })
    const result = await recordCumulativeUsage({
      userId: 'user-1',
      source: 'workspace-chat',
      model: 'claude-opus-4.8',
      cost: 0.4662453,
      eventKey: 'update-cost:msg-1-billing',
    })
    expect(result.billed).toBe(true)
    expect(result.total).toBe(0.4662453)
    expect(result.delta).toBeCloseTo(0.1188006, 9)
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        cost: '0.4662453',
        rawCost: '0.4662453',
        billableCost: '0.4662453',
      })
    )
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('tops up using the multiplier locked on first flush, not the current env', async () => {
    const previousMultiplier = process.env.USAGE_LOG_COST_MULTIPLIER
    process.env.USAGE_LOG_COST_MULTIPLIER = '2'

    const { updateSet } = setupTx({
      id: 'row-1',
      cost: '0.3474447',
      rawCost: '0.3474447',
      pricingSnapshot: { multiplier: 1 },
    })
    const result = await recordCumulativeUsage({
      userId: 'user-1',
      source: 'workspace-chat',
      model: 'claude-opus-4.8',
      cost: 0.4662453,
      eventKey: 'update-cost:msg-1-billing',
    })

    expect(result.billed).toBe(true)
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        rawCost: '0.4662453',
        cost: '0.4662453',
        billableCost: '0.4662453',
      })
    )

    if (previousMultiplier === undefined) {
      delete process.env.USAGE_LOG_COST_MULTIPLIER
    } else {
      process.env.USAGE_LOG_COST_MULTIPLIER = previousMultiplier
    }
  })

  it('does not bill when the cumulative is not higher than recorded', async () => {
    const { updateSet } = setupTx({ id: 'row-1', cost: '0.4662453' })
    const result = await recordCumulativeUsage({
      userId: 'user-1',
      source: 'workspace-chat',
      model: 'claude-opus-4.8',
      cost: 0.4662453,
      eventKey: 'update-cost:msg-1-billing',
    })
    expect(result).toEqual({ billed: false, delta: 0, total: 0.4662453 })
    expect(updateSet).not.toHaveBeenCalled()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('resolves the billing context before opening the locked transaction, exactly once', async () => {
    setupTx(null)
    await recordCumulativeUsage({
      userId: 'user-1',
      source: 'workspace-chat',
      model: 'claude-opus-4.8',
      cost: 0.3474447,
      eventKey: 'update-cost:msg-1-billing',
    })
    // One lookup total: pre-resolved outside the tx, and the first-flush
    // insert reuses it instead of re-resolving on the pool inside the tx.
    expect(mockGetHighestPrioritySubscription).toHaveBeenCalledTimes(1)
    expect(mockGetHighestPrioritySubscription.mock.invocationCallOrder[0]).toBeLessThan(
      mockTransaction.mock.invocationCallOrder[0]
    )
  })

  it('stamps the pre-resolved billing context onto the first-flush insert', async () => {
    setupTx(null)
    await recordCumulativeUsage({
      userId: 'user-1',
      source: 'workspace-chat',
      model: 'claude-opus-4.8',
      cost: 0.3474447,
      eventKey: 'update-cost:msg-1-billing',
    })
    expect(mockValues.mock.calls[0][0][0]).toMatchObject({
      billingEntityId: 'org-1',
      billingEntityType: 'organization',
    })
  })

  it('stamps chat and run attribution on the first-flush insert', async () => {
    setupTx(null)
    await recordCumulativeUsage({
      userId: 'user-1',
      source: 'workspace-chat',
      model: 'claude-opus-4.8',
      cost: 0.3474447,
      eventKey: 'update-cost:msg-1-billing',
      chatId: 'chat-1',
      runId: 'run-1',
    })
    expect(mockValues.mock.calls[0][0][0]).toMatchObject({
      chatId: 'chat-1',
      runId: 'run-1',
    })
  })

  it('bounds the advisory-lock wait and locks on the 64-bit event-key hash', async () => {
    const { tx } = setupTx({ id: 'row-1', cost: '0.3474447' })
    await recordCumulativeUsage({
      userId: 'user-1',
      source: 'workspace-chat',
      model: 'claude-opus-4.8',
      cost: 0.4662453,
      eventKey: 'update-cost:msg-1-billing',
    })
    expect(executedSqlContaining(tx, 'lock_timeout')).toBe(true)
    expect(executedSqlContaining(tx, 'pg_advisory_xact_lock')).toBe(true)
    expect(executedSqlContaining(tx, 'hashtextextended')).toBe(true)
  })
})

describe('recordCumulativeUsage streaming idempotency with chatId/runId', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReturning.mockResolvedValue([{ cost: '0.3474447', billable: true }])
    mockOnConflictDoNothing.mockReturnValue({ returning: mockReturning })
    mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing })
    mockInsert.mockReturnValue({ values: mockValues })
    mockGetHighestPrioritySubscription.mockResolvedValue({
      periodEnd: new Date('2026-06-01T00:00:00.000Z'),
      periodStart: new Date('2026-05-01T00:00:00.000Z'),
      referenceId: 'org-1',
    })
    mockIsOrgScopedSubscription.mockReturnValue(true)
  })

  const setupTx = (existingRow: { id: string; cost: string; rawCost?: string } | null) => {
    const limit = vi.fn().mockResolvedValue(existingRow ? [existingRow] : [])
    const where = vi.fn().mockReturnValue({ limit })
    const from = vi.fn().mockReturnValue({ where })
    const select = vi.fn().mockReturnValue({ from })
    const updateWhere = vi.fn().mockResolvedValue(undefined)
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere })
    mockUpdate.mockReturnValue({ set: updateSet })
    const tx = {
      execute: vi.fn().mockResolvedValue(undefined),
      select,
      update: mockUpdate,
      insert: mockInsert,
    }
    mockTransaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx))
    return { updateSet }
  }

  const streamFlush = (cost: number, existing: { id: string; cost: string; rawCost?: string } | null) => {
    setupTx(existing)
    return recordCumulativeUsage({
      userId: 'user-1',
      workspaceId: 'ws-1',
      source: 'workspace-chat',
      model: 'claude-opus-4.8',
      cost,
      eventKey: 'update-cost:msg-1-billing',
      chatId: 'chat-1',
      runId: 'run-1',
    })
  }

  it('converges repeated stream flushes to a single ledger row for the eventKey', async () => {
    const first = await streamFlush(0.3, null)
    expect(first).toEqual({ billed: true, delta: 0.3, total: 0.3 })
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockUpdate).not.toHaveBeenCalled()

    const duplicate = await streamFlush(0.3, { id: 'row-1', cost: '0.3', rawCost: '0.3' })
    expect(duplicate).toEqual({ billed: false, delta: 0, total: 0.3 })
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockUpdate).not.toHaveBeenCalled()

    const recovered = await streamFlush(0.5, { id: 'row-1', cost: '0.3', rawCost: '0.3' })
    expect(recovered.billed).toBe(true)
    expect(recovered.total).toBe(0.5)
    expect(recovered.delta).toBeCloseTo(0.2, 9)
    expect(mockInsert).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledTimes(1)
  })

  it('preserves chatId and runId when topping up an existing cumulative row', async () => {
    const { updateSet } = setupTx({ id: 'row-1', cost: '0.3', rawCost: '0.3' })
    await recordCumulativeUsage({
      userId: 'user-1',
      workspaceId: 'ws-1',
      source: 'workspace-chat',
      model: 'claude-opus-4.8',
      cost: 0.5,
      eventKey: 'update-cost:msg-1-billing',
      chatId: 'chat-1',
      runId: 'run-1',
    })
    expect(updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 'chat-1',
        runId: 'run-1',
        cost: '0.5',
        rawCost: '0.5',
        billableCost: '0.5',
      })
    )
  })
})

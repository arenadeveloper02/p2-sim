/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockRecordUsage, mockCalculateCost, mockGetCostMultiplier } = vi.hoisted(() => ({
  mockRecordUsage: vi.fn(),
  mockCalculateCost: vi.fn(),
  mockGetCostMultiplier: vi.fn(),
}))

vi.mock('@/lib/billing/core/usage-log', () => ({
  recordUsage: mockRecordUsage,
}))

vi.mock('@/providers/utils', () => ({
  calculateCost: mockCalculateCost,
}))

vi.mock('@/lib/core/config/env-flags', () => ({
  getCostMultiplier: mockGetCostMultiplier,
}))

import { recordModelUsage } from '@/lib/billing/core/record-model-usage.server'

describe('recordModelUsage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCostMultiplier.mockReturnValue(1)
    mockCalculateCost.mockReturnValue({ total: 0.12 })
    mockRecordUsage.mockResolvedValue(undefined)
  })

  it('stamps chatId for Arena Copilot mothership ledger joins', async () => {
    await recordModelUsage({
      userId: 'user-1',
      workspaceId: 'ws-1',
      chatId: 'chat-1',
      model: 'claude-opus-4-8',
      inputTokens: 100,
      outputTokens: 50,
      source: 'copilot',
      sourceReference: 'arena-copilot:chat-1:round-0',
    })

    expect(mockRecordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        workspaceId: 'ws-1',
        chatId: 'chat-1',
        entries: [
          expect.objectContaining({
            category: 'model',
            source: 'copilot',
            description: 'claude-opus-4-8',
            cost: 0.12,
            sourceReference: 'arena-copilot:chat-1:round-0',
          }),
        ],
      })
    )
  })

  it('omits chatId when not provided', async () => {
    await recordModelUsage({
      userId: 'user-1',
      workspaceId: 'ws-1',
      model: 'claude-opus-4-8',
      inputTokens: 10,
      outputTokens: 5,
      source: 'copilot',
    })

    expect(mockRecordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        workspaceId: 'ws-1',
      })
    )
    expect(mockRecordUsage.mock.calls[0][0]).not.toHaveProperty('chatId')
  })
})

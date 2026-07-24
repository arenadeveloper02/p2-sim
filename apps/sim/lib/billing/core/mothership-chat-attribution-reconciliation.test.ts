/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  type AttributionMatchCandidate,
  type CostInvariantSnapshot,
  costsMatch,
} from '@/lib/billing/core/mothership-chat-attribution-reconciliation'
import { parseUpdateCostBillingMessageId } from '@/lib/billing/core/usage-attribution-backfill'
import { buildNullOnlyAttributionFill } from '@/lib/billing/core/usage-log'

describe('mothership chat attribution reconciliation helpers', () => {
  it('requires byte-identical cost snapshots', () => {
    const base: CostInvariantSnapshot = {
      rowCount: 222,
      sumCost: '140.17000000',
      sumRawCost: '140.17000000',
      sumBillableCost: '140.17000000',
      bySource: [
        {
          source: 'workspace-chat',
          rowCount: 160,
          sumCost: '100',
          sumRawCost: '100',
          sumBillableCost: '100',
        },
        {
          source: 'copilot',
          rowCount: 62,
          sumCost: '40.17000000',
          sumRawCost: '40.17000000',
          sumBillableCost: '40.17000000',
        },
      ],
    }
    expect(costsMatch(base, structuredClone(base))).toBe(true)
    expect(
      costsMatch(base, {
        ...base,
        sumCost: '140.17000001',
      })
    ).toBe(false)
  })

  it('parses update-cost billing message ids for exact matching', () => {
    expect(parseUpdateCostBillingMessageId('update-cost:msg-abc-billing')).toBe('msg-abc')
    expect(parseUpdateCostBillingMessageId('arena-copilot:chat:round-0')).toBeNull()
  })

  it('null-only fill never overwrites existing chat attribution', () => {
    expect(
      buildNullOnlyAttributionFill(
        {
          workspaceId: 'ws-1',
          chatId: 'chat-existing',
          runId: null,
          actorUserId: null,
          actorType: null,
          parentExecutionId: null,
          rootExecutionId: null,
          triggeringChatId: null,
          triggeringRunId: null,
        },
        {
          chatId: 'chat-other',
          runId: 'run-1',
        }
      )
    ).toEqual({ runId: 'run-1' })
  })

  it('accepts run-window-unique as an exact attribution strategy', () => {
    const match: AttributionMatchCandidate = {
      id: 'usage-1',
      eventKey: 'a'.repeat(64),
      source: 'copilot',
      chatId: '5ae5c46d-5ae1-4e5b-a13c-8303ca7ac291',
      runId: 'dcecdb78-5988-4ef2-afe8-a5aaea0bf042',
      strategy: 'run-window-unique',
    }
    expect(match.strategy).toBe('run-window-unique')
    expect(match.chatId).toBeTruthy()
    expect(match.runId).toBeTruthy()
  })
})

/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildLegacyLocalCopilotRoundSourceReference,
  buildLocalCopilotComponentEventKey,
  buildLocalCopilotTurnEventKey,
} from '@/local-copilot/lib/billing/event-keys'
import {
  extractLocalToolBillingMetadata,
  LocalTurnCostAccumulator,
} from '@/local-copilot/lib/billing/turn-cost-accumulator'

describe('Local Arena Copilot billing event keys', () => {
  it('legacy chatId+round keys collide across different messages in the same chat', () => {
    const messageARound0 = buildLegacyLocalCopilotRoundSourceReference({
      chatId: 'chat-1',
      workspaceId: 'ws-1',
      round: 0,
    })
    const messageBRound0 = buildLegacyLocalCopilotRoundSourceReference({
      chatId: 'chat-1',
      workspaceId: 'ws-1',
      round: 0,
    })
    expect(messageARound0).toBe(messageBRound0)
    expect(messageARound0).toBe('arena-copilot:chat-1:round-0')
  })

  it('message-scoped turn keys stay distinct for different messages in the same chat', () => {
    const first = buildLocalCopilotTurnEventKey({
      chatId: 'chat-1',
      workspaceId: 'ws-1',
      messageId: 'msg-a',
    })
    const second = buildLocalCopilotTurnEventKey({
      chatId: 'chat-1',
      workspaceId: 'ws-1',
      messageId: 'msg-b',
    })
    expect(first).toBe('arena-copilot:chat-1:message:msg-a')
    expect(second).toBe('arena-copilot:chat-1:message:msg-b')
    expect(first).not.toBe(second)
  })

  it('retries of the same message remain idempotent under the turn key', () => {
    const first = buildLocalCopilotTurnEventKey({
      chatId: 'chat-1',
      workspaceId: 'ws-1',
      messageId: 'msg-a',
    })
    const retry = buildLocalCopilotTurnEventKey({
      chatId: 'chat-1',
      workspaceId: 'ws-1',
      messageId: 'msg-a',
    })
    expect(first).toBe(retry)
    expect(
      buildLocalCopilotComponentEventKey({
        turnEventKey: first,
        component: 'model',
        componentId: 'claude-opus-4.8',
      })
    ).toBe('arena-copilot:chat-1:message:msg-a:model:claude-opus-4.8')
  })
})

describe('LocalTurnCostAccumulator', () => {
  it('excludes run_workflow child cost from the turn aggregate', () => {
    const accumulator = new LocalTurnCostAccumulator()
    accumulator.addToolBilling({
      toolName: 'run_workflow',
      billing: { cost: 1.25, toolId: 'run_workflow' },
    })
    accumulator.addToolBilling({
      toolName: 'search_online',
      billing: { cost: 0.01, service: 'exa', toolId: 'search_online' },
    })
    const summary = accumulator.summarize()
    expect(summary.total).toBeCloseTo(0.01, 8)
    expect(summary.components).toHaveLength(1)
    expect(summary.components[0]?.id).toBe('search_online')
  })

  it('extracts trusted _serviceCost and explicit billing metadata', () => {
    expect(
      extractLocalToolBillingMetadata({ _serviceCost: { service: 'falai', cost: 0.02 } })
    ).toEqual({ cost: 0.02, service: 'falai' })
    expect(
      extractLocalToolBillingMetadata({
        billing: { cost: 0.05, toolId: 'generate_image', vendor: 'fal' },
      })
    ).toEqual({ cost: 0.05, toolId: 'generate_image', vendor: 'fal' })
    expect(extractLocalToolBillingMetadata({ cost: { total: 0.03 } })).toEqual({ cost: 0.03 })
    expect(extractLocalToolBillingMetadata({ ok: true })).toBeNull()
  })
})

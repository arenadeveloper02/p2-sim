/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildRepriceDeltaEntries,
  collectTraceExecutionArtifacts,
  resolveExternalDescription,
  COST_EPSILON,
} from '@/lib/billing/core/cost-block-reprice'

describe('cost-block-reprice', () => {
  it('collects block states and logs from nested trace spans', () => {
    const { blockStates, blockLogs } = collectTraceExecutionArtifacts([
      {
        blockId: 'api-1',
        status: 'success',
        executionOrder: 1,
        duration: 12,
        output: { data: { usage: { count: 3 } } },
        children: [
          {
            blockId: 'cost-1',
            status: 'success',
            executionOrder: 2,
            duration: 1,
            output: { recorded: true, cost: { total: 0.03 } },
          },
        ],
      },
    ])

    expect(blockStates.get('api-1')?.output).toEqual({ data: { usage: { count: 3 } } })
    expect(blockStates.get('cost-1')?.executed).toBe(true)
    expect(blockLogs).toHaveLength(2)
    expect(blockLogs[0]?.success).toBe(true)
  })

  it('builds positive delta entries for missing external ledger rows', () => {
    const deltas = buildRepriceDeltaEntries({
      executionId: 'exec-1',
      targets: [
        {
          description: 'Twilio Cost',
          target: 0.42,
          vendor: 'Twilio',
          quantity: 1,
          unit: 'message',
          costBlockId: 'cost-1',
        },
      ],
      alreadyBilled: new Map(),
    })

    expect(deltas).toHaveLength(1)
    expect(deltas[0]).toMatchObject({
      category: 'external',
      source: 'workflow',
      description: 'Twilio Cost',
      cost: 0.42,
      vendor: 'Twilio',
      quantity: 1,
      unit: 'message',
    })
    expect(deltas[0]?.eventKey).toBeTruthy()
  })

  it('skips deltas below the billing epsilon', () => {
    const deltas = buildRepriceDeltaEntries({
      executionId: 'exec-1',
      targets: [
        {
          description: 'Partner Cost',
          target: 0.42,
          costBlockId: 'cost-1',
        },
      ],
      alreadyBilled: new Map([['external::Partner Cost', 0.42 - COST_EPSILON / 2]]),
    })

    expect(deltas).toHaveLength(0)
  })

  it('resolves external descriptions from block name first', () => {
    expect(resolveExternalDescription('Twilio Cost', { vendor: 'Twilio', label: 'SMS' })).toBe(
      'Twilio Cost'
    )
    expect(resolveExternalDescription('', { vendor: 'Twilio', label: 'SMS' })).toBe('SMS')
  })
})

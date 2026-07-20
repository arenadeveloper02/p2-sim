/**
 * @vitest-environment node
 */

import { describe, expect, it } from 'vitest'
import {
  applyEmbeddedToolChargeTypeSplit,
  computeEmbeddedToolVirtualSplit,
  mergeEmbeddedToolBucketRows,
} from '@/lib/workspaces/usage/embedded-tool-virtual-split'

describe('embedded-tool-virtual-split', () => {
  it('moves embedded tool spend from provider to tool buckets without changing totals', () => {
    const split = computeEmbeddedToolVirtualSplit([
      {
        executionId: 'exec-1',
        description: 'gpt-5.5',
        provider: 'openai',
        cost: '0.10',
        rawCost: '0.08',
        metadata: {
          inputTokens: 1000,
          outputTokens: 100,
          toolCost: 0.04,
          embeddedToolCosts: { 'gpt-image-1.5': 0.04 },
        },
      },
    ])

    const adjusted = applyEmbeddedToolChargeTypeSplit(
      [
        { chargeType: 'provider', billableCost: 0.1, rawCost: 0.08, count: 1 },
        { chargeType: 'tool', billableCost: 0.01, rawCost: 0.01, count: 1 },
      ],
      split
    )

    expect(adjusted).toEqual([
      expect.objectContaining({
        chargeType: 'provider',
        billableCost: expect.closeTo(0.06, 8),
        rawCost: expect.closeTo(0.048, 8),
        count: 1,
      }),
      expect.objectContaining({
        chargeType: 'tool',
        billableCost: expect.closeTo(0.05, 8),
        rawCost: expect.closeTo(0.042, 8),
        count: 1,
      }),
    ])

    const providerTotal = adjusted.find((row) => row.chargeType === 'provider')!.billableCost
    const toolTotal = adjusted.find((row) => row.chargeType === 'tool')!.billableCost
    expect(providerTotal + toolTotal).toBeCloseTo(0.11, 8)
  })

  it('maps legacy aggregate-only toolCost to unattributed agent tools', () => {
    const split = computeEmbeddedToolVirtualSplit([
      {
        executionId: 'exec-1',
        description: 'gpt-4o',
        provider: 'openai',
        cost: '0.05',
        rawCost: '0.05',
        metadata: {
          inputTokens: 500,
          outputTokens: 50,
          toolCost: 0.02,
        },
      },
    ])

    const byTool = mergeEmbeddedToolBucketRows([], split.byToolEmbedded)
    expect(byTool).toEqual([
      {
        toolId: 'unattributed_agent_tools',
        billableCost: 0.02,
        rawCost: 0.02,
        count: 0,
      },
    ])
  })
})

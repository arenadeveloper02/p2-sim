/**
 * Run with: bun test .sandcastle/lib/usage.test.ts
 */
import { describe, expect, test } from 'bun:test'
import {
  formatUsageMarkdown,
  parseCostFromStdout,
  recordAgentUsage,
  resetUsageRecords,
} from './usage'

describe('usage reporting', () => {
  test('formatUsageMarkdown aggregates token totals', () => {
    resetUsageRecords()
    recordAgentUsage('parent-grill-analysis', 'claude-opus-4-8', {
      stdout: '{"total_cost_usd":1.5}',
      iterations: [
        {
          usage: {
            inputTokens: 100,
            outputTokens: 50,
            cacheReadInputTokens: 1000,
            cacheCreationInputTokens: 200,
          },
        },
      ],
    } as never)

    const markdown = formatUsageMarkdown([
      {
        agentName: 'parent-grill-analysis',
        model: 'claude-opus-4-8',
        iterations: 1,
        inputTokens: 100,
        outputTokens: 50,
        cacheReadInputTokens: 1000,
        cacheCreationInputTokens: 200,
        estimatedCostUsd: 1.5,
      },
    ])

    expect(markdown).toContain('claude-opus-4-8')
    expect(markdown).toContain('Total input tokens:** 1,300')
    expect(markdown).toContain('Total output tokens:** 50')
    expect(markdown).toContain('Total estimated cost:** $1.500000')
  })

  test('parseCostFromStdout reads embedded JSON cost', () => {
    expect(parseCostFromStdout('{"total_cost_usd":2.179179}')).toBe(2.179179)
    expect(parseCostFromStdout('no cost here')).toBeNull()
  })
})

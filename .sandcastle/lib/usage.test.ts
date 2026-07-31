/**
 * Run with: bun test .sandcastle/lib/usage.test.ts
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  estimateCostFromTokens,
  formatUsageMarkdown,
  formatUsageStepSummary,
  parseCostFromStdout,
  persistUsageArtifacts,
  recordAgentUsage,
  resetUsageRecords,
  resolveModelPricing,
  writeUsageJson,
} from './usage'

describe('usage reporting', () => {
  afterEach(() => {
    resetUsageRecords()
    delete process.env.GITHUB_STEP_SUMMARY
  })

  test('formatUsageMarkdown aggregates token totals and shows provider cost', () => {
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
        costSource: 'provider',
      },
    ])

    expect(markdown).toContain('claude-opus-4-8')
    expect(markdown).toContain('Total input tokens:** 1,300')
    expect(markdown).toContain('Total output tokens:** 50')
    expect(markdown).toContain('Provider-reported cost:** $1.500000')
    expect(markdown).toContain('Cost:** $1.500000 (provider-reported)')
  })

  test('formatUsageMarkdown always includes estimated cost line with source', () => {
    const markdown = formatUsageMarkdown([
      {
        agentName: 'child-cluster-0',
        model: 'claude-sonnet-4-6',
        iterations: 2,
        inputTokens: 1_000_000,
        outputTokens: 100_000,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        estimatedCostUsd: 4.5,
        costSource: 'estimated',
      },
    ])

    expect(markdown).toContain('Estimated cost (fallback):** $4.500000')
    expect(markdown).toContain('Cost:** $4.500000 (estimated fallback)')
    expect(markdown).not.toContain('Total cost:** unavailable')
  })

  test('formatUsageMarkdown shows unavailable when tokens and cost are missing', () => {
    const markdown = formatUsageMarkdown([
      {
        agentName: 'silent-agent',
        model: 'claude-opus-4-8',
        iterations: 1,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        estimatedCostUsd: null,
        costSource: 'unavailable',
      },
    ])

    expect(markdown).toContain('Cost:** unavailable')
    expect(markdown).toContain('Total cost:** unavailable')
  })

  test('parseCostFromStdout reads embedded JSON cost', () => {
    expect(parseCostFromStdout('{"total_cost_usd":2.179179}')).toBe(2.179179)
    expect(parseCostFromStdout('no cost here')).toBeNull()
  })

  test('recordAgentUsage prefers provider cost from stdout', () => {
    const record = recordAgentUsage('parent-grill-analysis', 'claude-opus-4-8', {
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

    expect(record?.estimatedCostUsd).toBe(1.5)
    expect(record?.costSource).toBe('provider')
  })

  test('recordAgentUsage estimates cost from tokens when stdout has no cost', () => {
    const record = recordAgentUsage('child-cluster-0', 'claude-sonnet-4-6', {
      stdout: 'done without cost json',
      iterations: [
        {
          usage: {
            inputTokens: 1_000_000,
            outputTokens: 200_000,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
          },
        },
      ],
    } as never)

    // 1M * $3 + 0.2M * $15 = $3 + $3 = $6
    expect(record?.estimatedCostUsd).toBe(6)
    expect(record?.costSource).toBe('estimated')
  })

  test('recordAgentUsage marks cost unavailable when tokens are zero and stdout has no cost', () => {
    const record = recordAgentUsage('empty-agent', 'claude-opus-4-8', {
      stdout: '',
      iterations: [{ usage: { inputTokens: 0, outputTokens: 0 } }],
    } as never)

    expect(record?.estimatedCostUsd).toBeNull()
    expect(record?.costSource).toBe('unavailable')
  })

  test('estimateCostFromTokens uses Opus/Sonnet/GPT price table', () => {
    expect(resolveModelPricing('claude-opus-4-8').inputPerMTok).toBe(5)
    expect(resolveModelPricing('claude-sonnet-4-6').inputPerMTok).toBe(3)
    expect(resolveModelPricing('gpt-5.5').outputPerMTok).toBe(30)

    expect(
      estimateCostFromTokens('claude-opus-4-8', {
        inputTokens: 1_000_000,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      })
    ).toBe(5)

    expect(
      estimateCostFromTokens('gpt-5.5', {
        inputTokens: 1_000_000,
        outputTokens: 100_000,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      })
    ).toBe(8)
  })

  test('formatUsageStepSummary renders a compact cost table', () => {
    const summary = formatUsageStepSummary([
      {
        agentName: 'parent-grill-analysis',
        model: 'claude-opus-4-8',
        iterations: 1,
        inputTokens: 100,
        outputTokens: 50,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        estimatedCostUsd: 1.25,
        costSource: 'estimated',
      },
    ])

    expect(summary).toContain('| Agent | Model | Input tokens | Output tokens | Cost | Source |')
    expect(summary).toContain('parent-grill-analysis')
    expect(summary).toContain('$1.2500')
    expect(summary).toContain('estimated')
    expect(summary).toContain('**Total cost:** $1.2500')
  })

  test('persistUsageArtifacts writes usage.json under the ledger run dir', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'usage-ledger-'))
    const previousCwd = process.cwd()
    try {
      process.chdir(tempDir)
      recordAgentUsage('parent-grill-analysis', 'claude-opus-4-8', {
        stdout: '',
        iterations: [
          {
            usage: {
              inputTokens: 1000,
              outputTokens: 100,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
          },
        ],
      } as never)

      const markdown = persistUsageArtifacts('2026-07-31')
      const usagePath = join(tempDir, '.upstream-sync/ledger/2026-07-31/usage.json')
      const payload = JSON.parse(readFileSync(usagePath, 'utf8')) as {
        runId: string
        agents: Array<{ costSource: string }>
      }

      expect(markdown).toContain('Estimated cost (fallback)')
      expect(payload.runId).toBe('2026-07-31')
      expect(payload.agents[0]?.costSource).toBe('estimated')
      expect(writeUsageJson('2026-07-31')).toBe('.upstream-sync/ledger/2026-07-31/usage.json')
      expect(readFileSync(usagePath, 'utf8')).toContain('"costSource": "estimated"')

      const summaryPath = join(tempDir, 'step-summary.md')
      process.env.GITHUB_STEP_SUMMARY = summaryPath
      resetUsageRecords()
      recordAgentUsage('parent-grill-analysis', 'claude-opus-4-8', {
        stdout: '',
        iterations: [
          {
            usage: {
              inputTokens: 1000,
              outputTokens: 100,
              cacheReadInputTokens: 0,
              cacheCreationInputTokens: 0,
            },
          },
        ],
      } as never)
      persistUsageArtifacts('2026-07-31')
      persistUsageArtifacts('2026-07-31') // second call must not duplicate the summary
      const summary = readFileSync(summaryPath, 'utf8')
      expect(summary).toContain('## Agent usage')
      expect(summary.match(/## Agent usage/g)?.length).toBe(1)
    } finally {
      process.chdir(previousCwd)
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})

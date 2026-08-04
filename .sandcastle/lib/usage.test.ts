/**
 * Run with: bun test ./.sandcastle/lib/usage.test.ts
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  estimateCostFromTokens,
  formatUsageMarkdown,
  formatUsageStepSummary,
  getUsageRecords,
  inferModelForAgentName,
  loadUsageRecordsFromJson,
  parseCostFromStdout,
  parseUsageFromClaudeStream,
  parseUsageFromCodexStream,
  persistUsageArtifacts,
  publishUsageJobSummary,
  recordAgentUsage,
  recoverUsageFromLogDir,
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
    expect(markdown).toContain('Total cost:** $1.500000')
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
    expect(markdown).toContain('Total cost:** $4.500000')
    expect(markdown).toContain('Cost:** $4.500000 (estimated fallback)')
    expect(markdown).not.toContain('Total cost:** unavailable')
  })

  test('formatUsageMarkdown dual run totals provider Opus + estimated Luna', () => {
    const markdown = formatUsageMarkdown([
      {
        agentName: 'parent-grill-analysis',
        model: 'claude-opus-5',
        iterations: 1,
        inputTokens: 100,
        outputTokens: 50,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        estimatedCostUsd: 1.25,
        costSource: 'provider',
      },
      {
        agentName: 'child-cluster-0',
        model: 'gpt-5.6-luna',
        iterations: 1,
        inputTokens: 1_000_000,
        outputTokens: 100_000,
        cacheReadInputTokens: 500_000,
        cacheCreationInputTokens: 0,
        estimatedCostUsd: 0.33,
        costSource: 'estimated',
      },
    ])

    expect(markdown).toContain('Total cost:** $1.580000')
    expect(markdown).toContain('Provider-reported cost:** $1.250000')
    expect(markdown).toContain('Estimated cost (fallback):** $0.330000')
  })

  test('parseUsageFromCodexStream reads turn.completed and estimates Luna cost', () => {
    const ndjson = [
      '{"type":"thread.started","thread_id":"t1"}',
      '{"type":"turn.completed","usage":{"input_tokens":1200,"cached_input_tokens":200,"output_tokens":100}}',
      '{"type":"turn.completed","usage":{"input_tokens":5000,"cached_input_tokens":1000,"output_tokens":400}}',
    ].join('\n')

    const parsed = parseUsageFromCodexStream(ndjson)
    expect(parsed).not.toBeNull()
    expect(parsed?.costUsd).toBeNull()
    // Largest cumulative footprint wins; billable input = 5000-1000
    expect(parsed?.tokens.inputTokens).toBe(4000)
    expect(parsed?.tokens.cacheReadInputTokens).toBe(1000)
    expect(parsed?.tokens.outputTokens).toBe(400)

    resetUsageRecords()
    const record = recordAgentUsage('child-cluster-3', 'gpt-5.6-luna', null, ndjson)
    expect(record?.costSource).toBe('estimated')
    // Per-million: (4000*0.2 + 400*1.2 + 1000*0.02) / 1e6 = 0.0013
    expect(record?.estimatedCostUsd).toBe(0.0013)
  })

  test('recordAgentUsage estimates Luna cost for million-token Codex children', () => {
    const ndjson =
      '{"type":"turn.completed","usage":{"input_tokens":1500000,"cached_input_tokens":500000,"output_tokens":200000}}'
    const record = recordAgentUsage('child-cluster-big', 'gpt-5.6-luna', null, ndjson)
    // billable input 1M @ $0.20 + cache 0.5M @ $0.02 + output 0.2M @ $1.20 = 0.2+0.01+0.24 = 0.45
    expect(record?.inputTokens).toBe(1_000_000)
    expect(record?.cacheReadInputTokens).toBe(500_000)
    expect(record?.estimatedCostUsd).toBe(0.45)
    expect(record?.costSource).toBe('estimated')
  })

  test('dual recover totals Opus provider cost + Luna estimated from mixed logs', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'usage-dual-'))
    try {
      writeFileSync(
        join(tempDir, 'parent-grill-analysis.log'),
        '{"type":"result","session_id":"p","total_cost_usd":2.5,"usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}\n'
      )
      writeFileSync(
        join(tempDir, 'child-cluster-0.log'),
        '{"type":"turn.completed","usage":{"input_tokens":1000000,"cached_input_tokens":0,"output_tokens":100000}}\n'
      )
      process.env.UPSTREAM_SYNC_AGENT = 'dual'
      const recovered = recoverUsageFromLogDir(tempDir)
      expect(recovered).toHaveLength(2)
      const summary = formatUsageStepSummary(getUsageRecords())
      expect(summary).toContain('**Total cost:** $2.8200')
      expect(summary).toContain('provider $2.5000')
      expect(summary).toContain('estimated $0.3200')
    } finally {
      delete process.env.UPSTREAM_SYNC_AGENT
      rmSync(tempDir, { recursive: true, force: true })
    }
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

  test('parseCostFromStdout reads max cumulative cost per session from NDJSON', () => {
    const ndjson = [
      '{"type":"result","session_id":"s1","total_cost_usd":1.5,"usage":{"input_tokens":1,"output_tokens":10,"cache_read_input_tokens":100,"cache_creation_input_tokens":20}}',
      '{"type":"result","session_id":"s1","total_cost_usd":2.179179,"usage":{"input_tokens":2,"output_tokens":50,"cache_read_input_tokens":500,"cache_creation_input_tokens":40}}',
      '{"type":"result","session_id":"s2","total_cost_usd":0.5,"usage":{"input_tokens":3,"output_tokens":5,"cache_read_input_tokens":10,"cache_creation_input_tokens":1}}',
    ].join('\n')

    expect(parseCostFromStdout(ndjson)).toBeCloseTo(2.679179)
    expect(parseCostFromStdout('no cost here')).toBeNull()
    expect(parseCostFromStdout('{"total_cost_usd":1.5}')).toBeNull() // not a result event
  })

  test('parseUsageFromClaudeStream sums max cost/tokens across sessions', () => {
    const ndjson = [
      '{"type":"assistant","message":{"usage":{"input_tokens":9,"output_tokens":9,"cache_read_input_tokens":9,"cache_creation_input_tokens":9}}}',
      '{"type":"result","session_id":"a","total_cost_usd":1.0,"usage":{"input_tokens":1,"output_tokens":10,"cache_read_input_tokens":100,"cache_creation_input_tokens":20}}',
      '{"type":"result","session_id":"a","total_cost_usd":1.5,"usage":{"input_tokens":2,"output_tokens":50,"cache_read_input_tokens":500,"cache_creation_input_tokens":40}}',
      '{"type":"result","session_id":"b","total_cost_usd":0.25,"usage":{"input_tokens":3,"output_tokens":7,"cache_read_input_tokens":30,"cache_creation_input_tokens":4}}',
    ].join('\n')

    const parsed = parseUsageFromClaudeStream(ndjson)
    expect(parsed?.costUsd).toBeCloseTo(1.75)
    expect(parsed?.tokens.inputTokens).toBe(5)
    expect(parsed?.tokens.outputTokens).toBe(57)
    expect(parsed?.tokens.cacheReadInputTokens).toBe(530)
    expect(parsed?.tokens.cacheCreationInputTokens).toBe(44)
  })

  test('recordAgentUsage prefers provider cost from stream NDJSON', () => {
    const record = recordAgentUsage(
      'parent-grill-analysis',
      'claude-opus-4-8',
      {
        stdout: '',
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
      } as never,
      '{"type":"result","session_id":"s","total_cost_usd":1.5,"usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":1000,"cache_creation_input_tokens":200}}'
    )

    expect(record?.estimatedCostUsd).toBe(1.5)
    expect(record?.costSource).toBe('provider')
  })

  test('recordAgentUsage recovers tokens/cost from Claude NDJSON when iteration usage is empty', () => {
    const stream = [
      '{"type":"result","session_id":"child-1","total_cost_usd":0.8,"usage":{"input_tokens":10,"output_tokens":100,"cache_read_input_tokens":1000,"cache_creation_input_tokens":50}}',
      '{"type":"result","session_id":"child-1","total_cost_usd":1.25,"usage":{"input_tokens":12,"output_tokens":200,"cache_read_input_tokens":5000,"cache_creation_input_tokens":80}}',
    ].join('\n')

    const record = recordAgentUsage(
      'child-cluster-1',
      'claude-sonnet-4-6',
      {
        stdout: 'agent text only — no usage fields',
        iterations: [{ usage: undefined }],
      } as never,
      stream
    )

    expect(record?.costSource).toBe('provider')
    expect(record?.estimatedCostUsd).toBe(1.25)
    expect(record?.inputTokens).toBe(12)
    expect(record?.outputTokens).toBe(200)
    expect(record?.cacheReadInputTokens).toBe(5000)
    expect(record?.cacheCreationInputTokens).toBe(80)
  })

  test('recordAgentUsage prefers larger stream token footprint over last-turn iteration usage', () => {
    const stream =
      '{"type":"result","session_id":"s","total_cost_usd":2.0,"usage":{"input_tokens":20,"output_tokens":1000,"cache_read_input_tokens":9000,"cache_creation_input_tokens":100}}'

    const record = recordAgentUsage(
      'child-cluster-2',
      'claude-sonnet-4-6',
      {
        stdout: '',
        iterations: [
          {
            usage: {
              inputTokens: 1,
              outputTokens: 5,
              cacheReadInputTokens: 10,
              cacheCreationInputTokens: 2,
            },
          },
        ],
      } as never,
      stream
    )

    expect(record?.outputTokens).toBe(1000)
    expect(record?.cacheReadInputTokens).toBe(9000)
    expect(record?.estimatedCostUsd).toBe(2)
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

  test('recordAgentUsage returns null when tokens are zero and stdout has no cost', () => {
    const record = recordAgentUsage('empty-agent', 'claude-opus-4-8', {
      stdout: '',
      iterations: [{ usage: { inputTokens: 0, outputTokens: 0 } }],
    } as never)

    expect(record).toBeNull()
  })

  test('recordAgentUsage recovers from stream NDJSON when result is null (cancel/error)', () => {
    const stream =
      '{"type":"result","session_id":"s","total_cost_usd":0.42,"usage":{"input_tokens":10,"output_tokens":20,"cache_read_input_tokens":100,"cache_creation_input_tokens":5}}'

    const record = recordAgentUsage('child-cluster-0', 'claude-sonnet-4-6', null, stream)

    expect(record).not.toBeNull()
    expect(record?.estimatedCostUsd).toBe(0.42)
    expect(record?.costSource).toBe('provider')
    expect(record?.outputTokens).toBe(20)
    expect(record?.iterations).toBe(1)
  })

  test('recordAgentUsage returns null when both result and stream are empty', () => {
    expect(recordAgentUsage('ghost', 'claude-opus-4-8', null, '')).toBeNull()
    expect(recordAgentUsage('ghost', 'claude-opus-4-8', { stdout: '', iterations: [] } as never)).toBeNull()
  })

  test('recordAgentUsage upserts the larger footprint for the same agent name', () => {
    recordAgentUsage(
      'child-cluster-0',
      'claude-sonnet-4-6',
      null,
      '{"type":"result","session_id":"s","total_cost_usd":0.1,"usage":{"input_tokens":1,"output_tokens":1,"cache_read_input_tokens":1,"cache_creation_input_tokens":1}}'
    )
    recordAgentUsage(
      'child-cluster-0',
      'claude-sonnet-4-6',
      null,
      '{"type":"result","session_id":"s","total_cost_usd":0.9,"usage":{"input_tokens":10,"output_tokens":50,"cache_read_input_tokens":100,"cache_creation_input_tokens":20}}'
    )

    const records = getUsageRecords()
    expect(records).toHaveLength(1)
    expect(records[0]?.estimatedCostUsd).toBe(0.9)
    expect(records[0]?.outputTokens).toBe(50)
  })

  test('recoverUsageFromLogDir rebuilds records from verbose Sandcastle logs', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'usage-logs-'))
    try {
      const logPath = join(tempDir, 'parent-grill-analysis.log')
      writeFileSync(
        logPath,
        [
          'noise that is not json',
          '{"type":"assistant","message":{"content":"hi"}}',
          '{"type":"result","session_id":"s","total_cost_usd":1.25,"usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":1000,"cache_creation_input_tokens":200}}',
        ].join('\n')
      )

      const recovered = recoverUsageFromLogDir(tempDir)
      expect(recovered).toHaveLength(1)
      expect(recovered[0]?.agentName).toBe('parent-grill-analysis')
      expect(recovered[0]?.estimatedCostUsd).toBe(1.25)
      expect(recovered[0]?.costSource).toBe('provider')
      expect(getUsageRecords()).toHaveLength(1)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('inferModelForAgentName picks dual defaults (Opus parent, Luna children)', () => {
    delete process.env.UPSTREAM_SYNC_AGENT
    expect(inferModelForAgentName('parent-grill-analysis')).toContain('opus')
    expect(inferModelForAgentName('child-cluster-3')).toContain('luna')
  })

  test('inferModelForAgentName uses sonnet children in anthropic mode', () => {
    process.env.UPSTREAM_SYNC_AGENT = 'anthropic'
    try {
      expect(inferModelForAgentName('child-cluster-3')).toContain('sonnet')
    } finally {
      delete process.env.UPSTREAM_SYNC_AGENT
    }
  })

  test('publishUsageJobSummary writes the agent usage table to GITHUB_STEP_SUMMARY', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'usage-summary-'))
    const summaryPath = join(tempDir, 'summary.md')
    try {
      process.env.GITHUB_STEP_SUMMARY = summaryPath
      recordAgentUsage(
        'parent-grill-analysis',
        'claude-opus-4-8',
        null,
        '{"type":"result","session_id":"s","total_cost_usd":1.5,"usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}'
      )
      expect(publishUsageJobSummary()).toBe(true)
      const summary = readFileSync(summaryPath, 'utf8')
      expect(summary).toContain('## Agent usage')
      expect(summary).toContain('parent-grill-analysis')
      expect(summary).toContain('$1.5000')
      expect(summary).toContain('**Total cost:** $1.5000')
    } finally {
      delete process.env.GITHUB_STEP_SUMMARY
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('loadUsageRecordsFromJson reloads ledger usage for job summary republish', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'usage-reload-'))
    const previousCwd = process.cwd()
    try {
      process.chdir(tempDir)
      recordAgentUsage(
        'child-cluster-0',
        'claude-sonnet-4-6',
        null,
        '{"type":"result","session_id":"s","total_cost_usd":0.5,"usage":{"input_tokens":10,"output_tokens":20,"cache_read_input_tokens":0,"cache_creation_input_tokens":0}}'
      )
      writeUsageJson('2026-07-31')
      resetUsageRecords()
      expect(getUsageRecords()).toHaveLength(0)

      const loaded = loadUsageRecordsFromJson('2026-07-31')
      expect(loaded).toHaveLength(1)
      expect(loaded[0]?.estimatedCostUsd).toBe(0.5)
      expect(getUsageRecords()).toHaveLength(1)
    } finally {
      process.chdir(previousCwd)
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('estimateCostFromTokens uses Opus/Sonnet/GPT price table', () => {
    expect(resolveModelPricing('claude-opus-4-8').inputPerMTok).toBe(5)
    expect(resolveModelPricing('claude-sonnet-4-6').inputPerMTok).toBe(3)
    expect(resolveModelPricing('gpt-5.6-luna').inputPerMTok).toBe(0.2)
    expect(resolveModelPricing('gpt-5.6-luna').outputPerMTok).toBe(1.2)
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

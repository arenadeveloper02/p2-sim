/**
 * Run with: bun test ./.sandcastle/lib/job-summary.test.ts
 */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  formatRunJobSummary,
  publishRunJobSummary,
  readRunOutcome,
  writeRunOutcome,
} from './job-summary'
import { resetUsageRecords } from './usage'

describe('job summary', () => {
  afterEach(() => {
    resetUsageRecords()
    process.env.GITHUB_STEP_SUMMARY = undefined
  })

  test('formatRunJobSummary includes status, sync details, conflicts, verify, usage', () => {
    const markdown = formatRunJobSummary({
      outcome: {
        runId: '2026-07-31',
        kind: 'awaiting_input',
        title: '3 unresolved merge conflict(s)',
        detail: 'Review ledger and resume.',
        syncBranch: 'upstream-sync/2026-07-31T07-40-03',
        mergeBase: 'feat/github-merge-agent',
        upstreamSha: '19d929b1abcdef',
        prNumber: 668,
        commitCount: 429,
        remainingConflicts: ['apps/sim/a.ts', 'packages/db/b.sql'],
        verification: [
          { command: 'bun run check', success: true },
          { command: 'bun run lint', success: false, detail: 'lint error here' },
        ],
        recordedAt: '2026-07-31T12:00:00.000Z',
      },
      jobStatus: 'failure',
      usageRecords: [
        {
          agentName: 'parent-grill-analysis',
          model: 'claude-opus-4-8',
          iterations: 1,
          inputTokens: 100,
          outputTokens: 50,
          cacheReadInputTokens: 0,
          cacheCreationInputTokens: 0,
          estimatedCostUsd: 1.25,
          costSource: 'provider',
        },
      ],
      repository: 'arenadeveloper02/p2-sim',
      runUrl: 'https://github.com/arenadeveloper02/p2-sim/actions/runs/1',
    })

    expect(markdown).toContain('## Upstream sync — ⏸️ Awaiting input')
    expect(markdown).toContain('**3 unresolved merge conflict(s)**')
    expect(markdown).toContain('upstream-sync/2026-07-31T07-40-03')
    expect(markdown).toContain('feat/github-merge-agent')
    expect(markdown).toContain('19d929b1')
    expect(markdown).toContain('[#668](https://github.com/arenadeveloper02/p2-sim/pull/668)')
    expect(markdown).toContain('429')
    expect(markdown).toContain('### Remaining conflicts (2)')
    expect(markdown).toContain('apps/sim/a.ts')
    expect(markdown).toContain('❌ `bun run lint`')
    expect(markdown).toContain('lint error here')
    expect(markdown).toContain('## Agent usage')
    expect(markdown).toContain('parent-grill-analysis')
    expect(markdown).toContain('/upstream-sync resume')
  })

  test('formatRunJobSummary marks cancelled job even if outcome was failed', () => {
    const markdown = formatRunJobSummary({
      outcome: {
        runId: '2026-07-31',
        kind: 'failed',
        title: 'Harness error',
        recordedAt: '2026-07-31T12:00:00.000Z',
      },
      jobStatus: 'cancelled',
      usageRecords: [],
    })

    expect(markdown).toContain('❌ Cancelled')
    expect(markdown).toContain('## Agent usage')
    expect(markdown).toContain('_No agent usage captured._')
  })

  test('formatRunJobSummary shows completed verification strip', () => {
    const markdown = formatRunJobSummary({
      outcome: {
        runId: '2026-07-31',
        kind: 'completed',
        title: 'Upstream sync completed',
        syncBranch: 'upstream-sync/x',
        mergeBase: 'feat/github-merge-agent',
        upstreamSha: 'abc12345deadbeef',
        prNumber: 1,
        commitCount: 10,
        recordedAt: '2026-07-31T12:00:00.000Z',
      },
      jobStatus: 'success',
      usageRecords: [],
      repository: 'arenadeveloper02/p2-sim',
    })

    expect(markdown).toContain('✅ Completed')
    expect(markdown).toContain('bun run check')
    expect(markdown).toContain('left to CI')
    expect(markdown).toContain('full `bun run build` left to CI')
  })

  test('writeRunOutcome / readRunOutcome round-trip', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'outcome-'))
    const previousCwd = process.cwd()
    try {
      process.chdir(tempDir)
      writeRunOutcome('2026-07-31', {
        kind: 'failed',
        title: 'Harness error',
        errorMessage: 'boom',
        syncBranch: 'upstream-sync/x',
      })
      const loaded = readRunOutcome('2026-07-31')
      expect(loaded?.kind).toBe('failed')
      expect(loaded?.errorMessage).toBe('boom')
      expect(loaded?.syncBranch).toBe('upstream-sync/x')
    } finally {
      process.chdir(previousCwd)
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  test('publishRunJobSummary writes to GITHUB_STEP_SUMMARY', () => {
    const tempDir = mkdtempSync(join(tmpdir(), 'summary-'))
    const summaryPath = join(tempDir, 'summary.md')
    try {
      process.env.GITHUB_STEP_SUMMARY = summaryPath
      expect(
        publishRunJobSummary({
          outcome: {
            runId: '2026-07-31',
            kind: 'completed',
            title: 'done',
            recordedAt: '2026-07-31T12:00:00.000Z',
          },
          jobStatus: 'success',
          usageRecords: [],
        })
      ).toBe(true)
      const summary = readFileSync(summaryPath, 'utf8')
      expect(summary).toContain('✅ Completed')
      expect(summary).toContain('## Agent usage')
    } finally {
      process.env.GITHUB_STEP_SUMMARY = undefined
      rmSync(tempDir, { recursive: true, force: true })
    }
  })
})

/**
 * Run with: bun test .sandcastle/lib/config-wip.test.ts
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  applyMergeWip,
  assertUpstreamSyncRef,
  forceWithLeasePushArgs,
  listResolvedConflictFiles,
  parseMergeWipMeta,
  persistMergeWip,
  restoreWipLedger,
  shouldSkipStaleWip,
  WIP_META_RELATIVE_PATH,
  wipBranchName,
} from './config'

describe('wipBranchName', () => {
  test('appends -wip to a sync branch', () => {
    expect(wipBranchName('upstream-sync/2026-07-31T07-40-03')).toBe(
      'upstream-sync/2026-07-31T07-40-03-wip'
    )
  })

  test('is idempotent when already a WIP branch', () => {
    expect(wipBranchName('upstream-sync/2026-07-31T07-40-03-wip')).toBe(
      'upstream-sync/2026-07-31T07-40-03-wip'
    )
  })

  test('rejects non-sync refs', () => {
    expect(() => wipBranchName('feat/github-merge-agent')).toThrow(/non-sync ref/)
  })
})

describe('listResolvedConflictFiles', () => {
  test('returns all originals when the index has no unmerged paths', () => {
    // Outside a merge, `git diff --diff-filter=U` is empty, so every path counts as resolved.
    expect(listResolvedConflictFiles(['a.ts', 'b.ts'])).toEqual(['a.ts', 'b.ts'])
  })

  test('returns empty when given an empty snapshot', () => {
    expect(listResolvedConflictFiles([])).toEqual([])
  })
})
describe('assertUpstreamSyncRef', () => {
  test('allows upstream-sync refs', () => {
    expect(() => assertUpstreamSyncRef('upstream-sync/foo')).not.toThrow()
  })

  test('rejects version-5-main and feature branches', () => {
    expect(() => assertUpstreamSyncRef('version-5-main')).toThrow(/non-sync ref/)
    expect(() => assertUpstreamSyncRef('feat/github-merge-agent')).toThrow(/non-sync ref/)
  })
})

describe('forceWithLeasePushArgs', () => {
  test('first push uses plain -u without force', () => {
    const args = forceWithLeasePushArgs('upstream-sync/2026-07-31T07-40-03-wip')
    expect(args).toEqual(['push', '-u', 'origin', 'upstream-sync/2026-07-31T07-40-03-wip'])
    expect(args.some((arg) => arg === '--force' || arg.startsWith('--force-with-lease'))).toBe(
      false
    )
  })

  test('later push leases against the fetched remote SHA', () => {
    const args = forceWithLeasePushArgs('upstream-sync/2026-07-31T07-40-03-wip', 'abc123def456')
    expect(args).toEqual([
      'push',
      '--force-with-lease=refs/heads/upstream-sync/2026-07-31T07-40-03-wip:abc123def456',
      'origin',
      'upstream-sync/2026-07-31T07-40-03-wip',
    ])
    expect(args.some((arg) => arg === '--force')).toBe(false)
  })

  test('rejects non-sync force-push targets', () => {
    expect(() => forceWithLeasePushArgs('version-5-main')).toThrow(/non-sync ref/)
  })
})

describe('WIP decisionHash + tombstones', () => {
  test('shouldSkipStaleWip skips when expected hash mismatches stored hash', () => {
    expect(shouldSkipStaleWip('abc', 'abc')).toBe(false)
    expect(shouldSkipStaleWip('abc', 'def')).toBe(true)
    expect(shouldSkipStaleWip(null, 'def')).toBe(true)
    expect(shouldSkipStaleWip(undefined, 'def')).toBe(true)
  })

  test('shouldSkipStaleWip keeps legacy apply when expected hash is absent', () => {
    expect(shouldSkipStaleWip('abc', undefined)).toBe(false)
    expect(shouldSkipStaleWip('abc', null)).toBe(false)
    expect(shouldSkipStaleWip(null, undefined)).toBe(false)
  })

  test('parseMergeWipMeta reads decisionHash and deleted tombstones', () => {
    expect(
      parseMergeWipMeta({
        decisionHash: 'deadbeef',
        deleted: ['apps/sim/lib/voice/tts.ts', ''],
        updatedAt: '2026-08-05T00:00:00.000Z',
        clusterId: 'chat-voice',
        runId: '2026-08-05',
      })
    ).toEqual({
      decisionHash: 'deadbeef',
      stabilityHash: null,
      deleted: ['apps/sim/lib/voice/tts.ts'],
      updatedAt: '2026-08-05T00:00:00.000Z',
      clusterId: 'chat-voice',
      runId: '2026-08-05',
    })
    expect(parseMergeWipMeta({ deleted: 'nope' })).toEqual({
      decisionHash: null,
      stabilityHash: null,
      deleted: [],
      updatedAt: expect.any(String),
    })
    expect(parseMergeWipMeta(null)).toBeNull()
  })
})

describe('persistMergeWip / applyMergeWip roundtrip', () => {
  const originalCwd = process.cwd()
  const originalRunnerTemp = process.env.RUNNER_TEMP
  let tempRoot = ''

  afterEach(() => {
    process.chdir(originalCwd)
    if (originalRunnerTemp === undefined) process.env.RUNNER_TEMP = undefined
    else process.env.RUNNER_TEMP = originalRunnerTemp
    if (tempRoot) {
      try {
        execFileSync('git', ['worktree', 'prune'], {
          cwd: join(tempRoot, 'work'),
          encoding: 'utf8',
        })
      } catch {
        // Repo may already be gone.
      }
      rmSync(tempRoot, { recursive: true, force: true })
      tempRoot = ''
    }
  })

  test('stores deletion tombstones and reuses WIP when only directive hash drifts', () => {
    tempRoot = mkdtempSync(join(tmpdir(), 'wip-roundtrip-'))
    const origin = join(tempRoot, 'origin.git')
    const repo = join(tempRoot, 'work')
    const runnerTemp = join(tempRoot, 'runner')
    mkdirSync(runnerTemp, { recursive: true })
    process.env.RUNNER_TEMP = runnerTemp

    git(tempRoot, ['init', '--bare', origin])
    git(tempRoot, ['clone', origin, repo])
    git(repo, ['config', 'user.email', 'test@example.com'])
    git(repo, ['config', 'user.name', 'Test'])
    git(repo, ['config', 'commit.gpgsign', 'false'])

    writeFileSync(join(repo, 'keep.ts'), 'base-keep\n')
    writeFileSync(join(repo, 'gone.ts'), 'base-gone\n')
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'base'])
    git(repo, ['branch', '-M', 'feat/base'])
    git(repo, ['push', '-u', 'origin', 'feat/base'])

    git(repo, ['checkout', '-b', 'upstream-side'])
    writeFileSync(join(repo, 'keep.ts'), 'upstream-keep\n')
    writeFileSync(join(repo, 'gone.ts'), 'upstream-gone\n')
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'upstream'])

    git(repo, ['checkout', 'feat/base'])
    git(repo, ['checkout', '-b', 'upstream-sync/2026-08-05T00-00-00'])
    writeFileSync(join(repo, 'keep.ts'), 'fork-keep\n')
    writeFileSync(join(repo, 'gone.ts'), 'fork-gone\n')
    mkdirSync(join(repo, '.upstream-sync'), { recursive: true })
    writeFileSync(join(repo, '.upstream-sync/merge-policy.json'), '{}\n')
    writeFileSync(
      join(repo, '.upstream-sync/qa-history.jsonl'),
      `${JSON.stringify({
        id: 'q-keep',
        runId: '2026-08-05',
        answer: 'keep fork branding',
        source: 'pr-comment',
      })}\n`
    )
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'fork'])
    git(repo, ['push', '-u', 'origin', 'upstream-sync/2026-08-05T00-00-00'])

    try {
      git(repo, ['merge', 'upstream-side'])
    } catch {
      // conflicts expected
    }

    git(repo, ['checkout', '--ours', '--', 'keep.ts'])
    git(repo, ['add', '--', 'keep.ts'])
    git(repo, ['rm', '-f', '--', 'gone.ts'])

    mkdirSync(join(repo, '.upstream-sync/ledger/2026-08-05'), { recursive: true })
    writeFileSync(
      join(repo, '.upstream-sync/ledger/2026-08-05/merge-plan.json'),
      `${JSON.stringify({ version: 1, runId: '2026-08-05', kind: 'final', childClusters: [{ id: 'cluster-1' }] })}\n`
    )

    process.chdir(repo)
    const persisted = persistMergeWip({
      syncBranch: 'upstream-sync/2026-08-05T00-00-00',
      runId: '2026-08-05',
      clusterId: 'cluster-1',
      conflictSnapshot: ['keep.ts', 'gone.ts'],
      decisionHash: 'hash-v1',
    })
    expect(persisted).toBe(2)

    const wipBranch = 'upstream-sync/2026-08-05T00-00-00-wip'
    const metaRaw = git(repo, ['show', `origin/${wipBranch}:${WIP_META_RELATIVE_PATH}`])
    const meta = parseMergeWipMeta(JSON.parse(metaRaw))
    expect(meta?.decisionHash).toBe('hash-v1')
    expect(meta?.deleted).toEqual(['gone.ts'])

    git(repo, ['merge', '--abort'])
    rmSync(join(repo, '.upstream-sync/ledger/2026-08-05/merge-plan.json'), { force: true })
    try {
      git(repo, ['merge', 'upstream-side'])
    } catch {
      // conflicts again
    }

    expect(restoreWipLedger('upstream-sync/2026-08-05T00-00-00')).toBe(true)
    expect(
      readFileSync(join(repo, '.upstream-sync/ledger/2026-08-05/merge-plan.json'), 'utf8')
    ).toContain('"kind":"final"')

    const reused = applyMergeWip({
      syncBranch: 'upstream-sync/2026-08-05T00-00-00',
      expectedDecisionHash: 'hash-v2',
      runId: '2026-08-05',
    })
    expect(reused.skipped).toBe(false)
    expect(reused.applied).toBeGreaterThanOrEqual(1)
    expect(readFileSync(join(repo, 'keep.ts'), 'utf8')).toBe('fork-keep\n')

    // Calendar-day roll: WIP stored under 2026-08-05, resume runs as 2026-08-06.
    git(repo, ['merge', '--abort'])
    try {
      git(repo, ['merge', 'upstream-side'])
    } catch {
      // conflicts again
    }
    const crossDay = applyMergeWip({
      syncBranch: 'upstream-sync/2026-08-05T00-00-00',
      expectedDecisionHash: 'hash-v2',
      runId: '2026-08-06',
    })
    expect(crossDay.skipped).toBe(false)
    expect(crossDay.applied).toBeGreaterThanOrEqual(1)
    expect(readFileSync(join(repo, 'keep.ts'), 'utf8')).toBe('fork-keep\n')

    git(repo, ['merge', '--abort'])
    try {
      git(repo, ['merge', 'upstream-side'])
    } catch {
      // conflicts again
    }
    writeFileSync(
      join(repo, '.upstream-sync/merge-policy.json'),
      '{"forkFirst":["apps/changed/"]}\n'
    )
    const policyDrift = applyMergeWip({
      syncBranch: 'upstream-sync/2026-08-05T00-00-00',
      expectedDecisionHash: 'hash-v2',
      runId: '2026-08-05',
    })
    expect(policyDrift.skipped).toBe(false)
    expect(readFileSync(join(repo, 'keep.ts'), 'utf8')).toBe('fork-keep\n')

    git(repo, ['merge', '--abort'])
    try {
      git(repo, ['merge', 'upstream-side'])
    } catch {
      // conflicts again
    }
    writeFileSync(
      join(repo, '.upstream-sync/qa-history.jsonl'),
      `${readFileSync(join(repo, '.upstream-sync/qa-history.jsonl'), 'utf8')}${JSON.stringify({
        id: 'a-resume',
        runId: '2026-08-05',
        answer: '/upstream-sync resume\n\nContinue after pager stall.',
        source: 'resume',
      })}\n`
    )
    const resumeOnly = applyMergeWip({
      syncBranch: 'upstream-sync/2026-08-05T00-00-00',
      expectedDecisionHash: 'hash-v2',
      runId: '2026-08-05',
    })
    expect(resumeOnly.skipped).toBe(false)

    git(repo, ['merge', '--abort'])
    try {
      git(repo, ['merge', 'upstream-side'])
    } catch {
      // conflicts again
    }
    writeFileSync(
      join(repo, '.upstream-sync/qa-history.jsonl'),
      `${readFileSync(join(repo, '.upstream-sync/qa-history.jsonl'), 'utf8')}${JSON.stringify({
        id: 'q-new',
        runId: '2026-08-05',
        answer: 'take upstream oauth',
        source: 'pr-comment',
      })}\n`
    )
    const skipped = applyMergeWip({
      syncBranch: 'upstream-sync/2026-08-05T00-00-00',
      expectedDecisionHash: 'hash-v2',
      runId: '2026-08-05',
    })
    expect(skipped).toEqual({
      applied: 0,
      deleted: 0,
      skipped: true,
      reason: 'hash-mismatch',
    })
    expect(readFileSync(join(repo, 'keep.ts'), 'utf8')).toContain('<<<<<<<')

    const applied = applyMergeWip({
      syncBranch: 'upstream-sync/2026-08-05T00-00-00',
      expectedDecisionHash: 'hash-v1',
      runId: '2026-08-05',
    })
    expect(applied.skipped).toBe(false)
    expect(applied.applied).toBeGreaterThanOrEqual(1)
    expect(applied.deleted).toBe(1)
    expect(readFileSync(join(repo, 'keep.ts'), 'utf8')).toBe('fork-keep\n')
    expect(existsSync(join(repo, 'gone.ts'))).toBe(false)
  }, 60_000)
})

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

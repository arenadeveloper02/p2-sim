/**
 * Run with: bun test .sandcastle/lib/analysis.test.ts
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  type AnalysisBaseline,
  resolveCappedUpstreamTip,
  resolveNextReleaseTip,
  WAITING_FOR_NEXT_RELEASE,
} from './analysis'
import { readState, type UpstreamCommit } from './config'

function commit(sha: string, title: string): UpstreamCommit {
  return { sha, date: '2026-08-01', title, prNumber: null }
}

const baseline: AnalysisBaseline = {
  baselineSha: 'base',
  baselineSource: 'lastSyncedUpstreamSha',
  targetBranch: 'feat/github-merge-agent',
  upstreamHeadSha: 'head',
  mergeBaseSha: 'base',
}

const commits: UpstreamCommit[] = [
  commit('c1', 'fix: something'),
  commit('c2', 'v0.7.56: release'),
  commit('c3', 'feat: after release'),
  commit('c4', 'v0.7.57: release'),
  commit('head', 'chore: tip'),
]

afterEach(() => {
  process.env.UPSTREAM_SYNC_UNTIL_SHA = undefined
  process.env.UPSTREAM_SYNC_MAX_COMMITS = undefined
})

describe('resolveNextReleaseTip', () => {
  test('returns the first release commit after baseline', () => {
    expect(resolveNextReleaseTip(baseline, commits)).toEqual({
      kind: 'release',
      tipSha: 'c2',
      version: 'v0.7.56',
      commitCount: 2,
    })
  })

  test('returns noop when no release commit exists', () => {
    expect(
      resolveNextReleaseTip(baseline, [commit('c1', 'fix: wip'), commit('head', 'chore: tip')])
    ).toEqual({
      kind: 'noop',
      reason: WAITING_FOR_NEXT_RELEASE,
    })
  })
})

describe('resolveCappedUpstreamTip', () => {
  test('defaults to the next release tip, not full HEAD', () => {
    expect(
      resolveCappedUpstreamTip(baseline, {
        untilSha: null,
        maxCommits: 0,
        commits,
      })
    ).toMatchObject({
      kind: 'merge',
      tipSha: 'c2',
      reason: 'next-release v0.7.56',
      commitCount: 2,
      capped: true,
      version: 'v0.7.56',
    })
  })

  test('noops when there is no release and no escape', () => {
    expect(
      resolveCappedUpstreamTip(baseline, {
        untilSha: null,
        maxCommits: 0,
        commits: [commit('c1', 'fix: wip'), commit('head', 'chore: tip')],
      })
    ).toEqual({
      kind: 'noop',
      tipSha: null,
      commitCount: 0,
      reason: WAITING_FOR_NEXT_RELEASE,
    })
  })

  test('until_sha escape overrides next-release default', () => {
    expect(
      resolveCappedUpstreamTip(baseline, {
        untilSha: 'c3',
        maxCommits: 0,
        commits,
      })
    ).toMatchObject({
      kind: 'merge',
      tipSha: 'c3',
      reason: 'until-sha c3',
      commitCount: 3,
      capped: true,
    })
  })

  test('until_sha escape can target full HEAD past multiple releases', () => {
    expect(
      resolveCappedUpstreamTip(baseline, {
        untilSha: 'head',
        commits,
      })
    ).toMatchObject({
      kind: 'merge',
      tipSha: 'head',
      capped: false,
      commitCount: 5,
      reason: 'until-sha head',
    })
  })

  test('max_commits escape overrides next-release default', () => {
    expect(
      resolveCappedUpstreamTip(baseline, {
        untilSha: null,
        maxCommits: 1,
        commits,
      })
    ).toMatchObject({
      kind: 'merge',
      tipSha: 'c1',
      reason: 'max-commits=1',
      commitCount: 1,
    })
  })

  test('activeUpstreamSha locks resume to that tip', () => {
    expect(
      resolveCappedUpstreamTip(baseline, {
        untilSha: null,
        maxCommits: 0,
        activeUpstreamSha: 'c4',
        commits,
      })
    ).toMatchObject({
      kind: 'merge',
      tipSha: 'c4',
      reason: 'active-upstream-sha c4',
      commitCount: 4,
    })
  })
})

describe('readState activeUpstreamSha default', () => {
  const originalCwd = process.cwd()
  let tempDir = ''

  afterEach(() => {
    process.chdir(originalCwd)
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true })
      tempDir = ''
    }
  })

  test('legacy state.json without activeUpstreamSha defaults to null', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'upstream-sync-state-'))
    mkdirSync(join(tempDir, '.upstream-sync'), { recursive: true })
    writeFileSync(
      join(tempDir, '.upstream-sync/state.json'),
      `${JSON.stringify({
        lastSyncedUpstreamSha: 'abc',
        lastSyncedAt: null,
        lastRunId: '2026-08-01',
        status: 'idle',
        openQuestions: [],
        activeBranch: null,
        activePrNumber: null,
        activeMergeBase: 'main',
      })}\n`
    )
    process.chdir(tempDir)

    const state = readState()
    expect(state.activeUpstreamSha).toBeNull()
    expect(state.lastSyncedUpstreamSha).toBe('abc')
    expect(state.activeMergeBase).toBe('main')
  })
})

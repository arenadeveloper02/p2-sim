/**
 * Run with: bun test .sandcastle/lib/config-reuse-extend.test.ts
 */
import { describe, expect, test } from 'bun:test'
import {
  decideSyncBranchAction,
  EXTENDED_MARKER,
  formatExtendedBanner,
  formatExtendedPrComment,
  formatSyncPrTitle,
  QUESTION_MARKER,
  withExtendedBanner,
} from './config'

describe('decideSyncBranchAction', () => {
  test('reuses open PR when branch exists on remote', () => {
    expect(
      decideSyncBranchAction({
        force: false,
        activePrNumber: 42,
        activeBranch: 'upstream-sync/2026-07-30',
        prOpen: true,
        branchExistsOnRemote: true,
      })
    ).toEqual({
      action: 'reuse',
      branch: 'upstream-sync/2026-07-30',
      prNumber: 42,
    })
  })

  test('forces a fresh branch even when an open PR exists', () => {
    expect(
      decideSyncBranchAction({
        force: true,
        activePrNumber: 42,
        activeBranch: 'upstream-sync/2026-07-30',
        prOpen: true,
        branchExistsOnRemote: true,
      })
    ).toEqual({ action: 'fresh', reason: 'force' })
  })

  test('opens fresh when there is no active PR', () => {
    expect(
      decideSyncBranchAction({
        force: false,
        activePrNumber: null,
        activeBranch: null,
        prOpen: false,
        branchExistsOnRemote: false,
      })
    ).toEqual({ action: 'fresh', reason: 'no-open-pr' })
  })

  test('opens fresh when the prior PR is closed', () => {
    expect(
      decideSyncBranchAction({
        force: false,
        activePrNumber: 42,
        activeBranch: 'upstream-sync/2026-07-30',
        prOpen: false,
        branchExistsOnRemote: true,
      })
    ).toEqual({ action: 'fresh', reason: 'pr-closed' })
  })

  test('opens fresh when the sync branch is missing on origin', () => {
    expect(
      decideSyncBranchAction({
        force: false,
        activePrNumber: 42,
        activeBranch: 'upstream-sync/2026-07-30',
        prOpen: true,
        branchExistsOnRemote: false,
      })
    ).toEqual({ action: 'fresh', reason: 'branch-missing' })
  })

  test('opens fresh when activeBranch is null even if PR is open', () => {
    expect(
      decideSyncBranchAction({
        force: false,
        activePrNumber: 42,
        activeBranch: null,
        prOpen: true,
        branchExistsOnRemote: false,
      })
    ).toEqual({ action: 'fresh', reason: 'branch-missing' })
  })
})

describe('formatSyncPrTitle', () => {
  test('formats a normal sync title', () => {
    expect(
      formatSyncPrTitle({
        mergeBase: 'feat/github-merge-agent',
        runId: '2026-07-31',
      })
    ).toBe('upstream-sync: merge simstudioai/sim main into feat/github-merge-agent (2026-07-31)')
  })

  test('formats an extended sync title with sha8', () => {
    expect(
      formatSyncPrTitle({
        mergeBase: 'feat/github-merge-agent',
        runId: '2026-07-31',
        extendedToSha: 'abcdef1234567890',
      })
    ).toBe(
      'upstream-sync: merge simstudioai/sim main into feat/github-merge-agent (extended 2026-07-31 → abcdef12)'
    )
  })
})

describe('extended PR body helpers', () => {
  test('formatExtendedBanner includes previous/new SHAs and commit count', () => {
    const banner = formatExtendedBanner({
      previousSha: 'aaaaaaaaaaaaaaaa',
      newSha: 'bbbbbbbbbbbbbbbb',
      commitCount: 3,
      runId: '2026-07-31',
    })
    expect(banner).toContain('## Extended')
    expect(banner).toContain('aaaaaaaa')
    expect(banner).toContain('bbbbbbbb')
    expect(banner).toContain('Commits added | 3')
    expect(banner).toContain('.upstream-sync/ledger/2026-07-31/')
  })

  test('formatExtendedPrComment leads with the extension marker', () => {
    const comment = formatExtendedPrComment({
      previousSha: 'aaaaaaaaaaaaaaaa',
      newSha: 'bbbbbbbbbbbbbbbb',
      commitCount: 1,
      runId: '2026-07-31',
    })
    expect(comment.startsWith(EXTENDED_MARKER)).toBe(true)
    expect(comment).toContain('+1 commit)')
    expect(comment).toContain('aaaaaaaa')
    expect(comment).toContain('bbbbbbbb')
  })

  test('withExtendedBanner keeps the question marker first', () => {
    const body = `${QUESTION_MARKER}\n## Sync in progress\n\nDetails.`
    const banner = '## Extended\n\nExtended content.'
    const result = withExtendedBanner(body, banner)
    expect(result.startsWith(QUESTION_MARKER)).toBe(true)
    expect(result).toContain('## Extended')
    expect(result).toContain('## Sync in progress')
    expect(result.indexOf('## Extended')).toBeLessThan(result.indexOf('## Sync in progress'))
  })

  test('withExtendedBanner prepends when there is no question marker', () => {
    const body = '## Upstream sync — 2026-07-31\n\nDone.'
    const banner = '## Extended\n\nExtended content.'
    const result = withExtendedBanner(body, banner)
    expect(result.startsWith('## Extended')).toBe(true)
    expect(result).toContain('## Upstream sync — 2026-07-31')
  })
})

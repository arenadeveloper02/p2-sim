/**
 * Run with: bun test .sandcastle/lib/config-wip.test.ts
 */
import { describe, expect, test } from 'bun:test'
import {
  assertUpstreamSyncRef,
  forceWithLeasePushArgs,
  listResolvedConflictFiles,
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
  test('uses force-with-lease and never bare --force', () => {
    const args = forceWithLeasePushArgs('upstream-sync/2026-07-31T07-40-03-wip')
    expect(args).toEqual([
      'push',
      '--force-with-lease=refs/heads/upstream-sync/2026-07-31T07-40-03-wip:refs/heads/upstream-sync/2026-07-31T07-40-03-wip',
      'origin',
      'upstream-sync/2026-07-31T07-40-03-wip',
    ])
    expect(args.some((arg) => arg === '--force')).toBe(false)
  })

  test('rejects non-sync force-push targets', () => {
    expect(() => forceWithLeasePushArgs('version-5-main')).toThrow(/non-sync ref/)
  })
})

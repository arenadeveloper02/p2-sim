/**
 * Stacked release PR policy + helpers.
 * Run with: bun test .sandcastle/lib/config-reuse-extend.test.ts
 */
import { describe, expect, test } from 'bun:test'
import {
  allocateRunId,
  bootstrapStackFromActive,
  decideSyncBranchAction,
  defaultSyncState,
  formatStackTableMarkdown,
  formatSyncPrTitle,
  isTipSliceCompleted,
  markStackSuperseded,
  type SyncStackEntry,
  type SyncState,
  todayRunId,
  upsertStackTip,
} from './config'

function tipState(overrides: Partial<SyncState> = {}): SyncState {
  return {
    ...defaultSyncState(),
    activeBranch: 'upstream-sync/2026-08-05T10-46-19',
    activePrNumber: 681,
    activeMergeBase: 'feat/github-merge-agent',
    lastRunId: '2026-08-05',
    lastSyncedUpstreamSha: '6c3d11b2df6c1c18490a27dab17b48d881045918',
    status: 'completed',
    ...overrides,
  }
}

describe('decideSyncBranchAction', () => {
  test('stacks on an open completed tip', () => {
    expect(
      decideSyncBranchAction({
        force: false,
        activePrNumber: 681,
        activeBranch: 'upstream-sync/2026-08-05T10-46-19',
        prOpen: true,
        branchExistsOnRemote: true,
        tipCompleted: true,
      })
    ).toEqual({
      action: 'stack-on-tip',
      tipBranch: 'upstream-sync/2026-08-05T10-46-19',
      tipPrNumber: 681,
    })
  })

  test('continues an incomplete tip instead of stacking', () => {
    expect(
      decideSyncBranchAction({
        force: false,
        activePrNumber: 681,
        activeBranch: 'upstream-sync/2026-08-05T10-46-19',
        prOpen: true,
        branchExistsOnRemote: true,
        tipCompleted: false,
      })
    ).toEqual({
      action: 'continue-tip',
      branch: 'upstream-sync/2026-08-05T10-46-19',
      prNumber: 681,
    })
  })

  test('forces a fresh stack even when an open tip exists', () => {
    expect(
      decideSyncBranchAction({
        force: true,
        activePrNumber: 681,
        activeBranch: 'upstream-sync/2026-08-05T10-46-19',
        prOpen: true,
        branchExistsOnRemote: true,
        tipCompleted: true,
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
        tipCompleted: false,
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
        tipCompleted: true,
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
        tipCompleted: true,
      })
    ).toEqual({ action: 'fresh', reason: 'branch-missing' })
  })
})

describe('isTipSliceCompleted', () => {
  test('completed tip with no activeUpstreamSha is ready to stack', () => {
    expect(isTipSliceCompleted(tipState())).toBe(true)
  })

  test('in-flight tip with activeUpstreamSha is not completed', () => {
    expect(
      isTipSliceCompleted(
        tipState({
          status: 'running',
          activeUpstreamSha: '6c3d11b2df6c1c18490a27dab17b48d881045918',
        })
      )
    ).toBe(false)
  })

  test('awaiting_input tip is not completed', () => {
    expect(isTipSliceCompleted(tipState({ status: 'awaiting_input' }))).toBe(false)
  })
})

describe('bootstrapStackFromActive', () => {
  test('seeds stack[0] from open draft pointers without changing them', () => {
    const state = tipState({ stack: [] })
    const next = bootstrapStackFromActive(state)
    expect(next.stack).toHaveLength(1)
    expect(next.stack[0]).toEqual({
      runId: '2026-08-05',
      releaseVersion: null,
      upstreamSha: '6c3d11b2df6c1c18490a27dab17b48d881045918',
      branch: 'upstream-sync/2026-08-05T10-46-19',
      prNumber: 681,
      status: 'open',
    })
    expect(next.activePrNumber).toBe(681)
    expect(next.activeBranch).toBe('upstream-sync/2026-08-05T10-46-19')
  })

  test('does not overwrite an existing stack', () => {
    const existing: SyncStackEntry = {
      runId: '2026-08-05',
      releaseVersion: 'v0.7.56',
      upstreamSha: 'aaaa',
      branch: 'upstream-sync/a',
      prNumber: 1,
      status: 'open',
    }
    const next = bootstrapStackFromActive(tipState({ stack: [existing] }))
    expect(next.stack).toEqual([existing])
  })

  test('no-ops without active PR/branch', () => {
    expect(bootstrapStackFromActive(defaultSyncState()).stack).toEqual([])
  })
})

describe('upsertStackTip / markStackSuperseded', () => {
  test('appends a new tip when stacking', () => {
    const base: SyncStackEntry = {
      runId: '2026-08-05',
      releaseVersion: 'v0.7.56',
      upstreamSha: 'aaaa',
      branch: 'upstream-sync/a',
      prNumber: 681,
      status: 'open',
    }
    const tip: SyncStackEntry = {
      runId: '2026-08-06',
      releaseVersion: 'v0.7.57',
      upstreamSha: 'bbbb',
      branch: 'upstream-sync/b',
      prNumber: 700,
      status: 'open',
    }
    expect(upsertStackTip([base], tip)).toEqual([base, tip])
  })

  test('updates the tip entry when continuing the same branch', () => {
    const tip: SyncStackEntry = {
      runId: '2026-08-05',
      releaseVersion: null,
      upstreamSha: 'aaaa',
      branch: 'upstream-sync/a',
      prNumber: 681,
      status: 'open',
    }
    const updated = upsertStackTip([tip], {
      ...tip,
      runId: '2026-08-06',
      releaseVersion: 'v0.7.56',
      upstreamSha: 'bbbb',
    })
    expect(updated).toHaveLength(1)
    expect(updated[0].runId).toBe('2026-08-06')
    expect(updated[0].releaseVersion).toBe('v0.7.56')
  })

  test('marks open entries closed on fresh stack / tip merge', () => {
    const stack: SyncStackEntry[] = [
      {
        runId: 'a',
        releaseVersion: 'v1',
        upstreamSha: '1',
        branch: 'upstream-sync/a',
        prNumber: 1,
        status: 'open',
      },
      {
        runId: 'b',
        releaseVersion: 'v2',
        upstreamSha: '2',
        branch: 'upstream-sync/b',
        prNumber: 2,
        status: 'open',
      },
    ]
    expect(markStackSuperseded(stack, { keepTipPrNumber: 2 })).toEqual([
      { ...stack[0], status: 'closed' },
      { ...stack[1], status: 'merged' },
    ])
  })
})

describe('allocateRunId', () => {
  test('reuses preferred id when continuing a tip', () => {
    expect(
      allocateRunId({
        mode: 'reuse',
        preferredRunId: '2026-08-06',
      })
    ).toBe('2026-08-06')
  })

  test('avoids reserved ids when stacking a new slice', () => {
    const base = todayRunId()
    expect(
      allocateRunId({
        mode: 'new',
        reservedRunIds: [base, `${base}-2`],
      })
    ).toBe(`${base}-3`)
  })

  test('returns calendar id when nothing is reserved', () => {
    expect(allocateRunId({ mode: 'new', reservedRunIds: [] })).toBe(todayRunId())
  })
})

describe('formatSyncPrTitle', () => {
  test('formats a land-target base title with release version', () => {
    expect(
      formatSyncPrTitle({
        mergeBase: 'feat/github-merge-agent',
        runId: '2026-08-06',
        releaseVersion: 'v0.7.57',
      })
    ).toBe('upstream-sync: v0.7.57 → feat/github-merge-agent (2026-08-06)')
  })

  test('formats a stacked tip title', () => {
    expect(
      formatSyncPrTitle({
        mergeBase: 'upstream-sync/2026-08-05T10-46-19',
        runId: '2026-08-06',
        releaseVersion: 'v0.7.57',
      })
    ).toBe('upstream-sync: v0.7.57 → stack tip (2026-08-06)')
  })
})

describe('formatStackTableMarkdown', () => {
  test('renders stack rows with tip highlight', () => {
    const markdown = formatStackTableMarkdown(
      [
        {
          runId: '2026-08-05',
          releaseVersion: 'v0.7.56',
          upstreamSha: 'aaaa',
          branch: 'upstream-sync/a',
          prNumber: 681,
          status: 'open',
        },
        {
          runId: '2026-08-06',
          releaseVersion: 'v0.7.57',
          upstreamSha: 'bbbb',
          branch: 'upstream-sync/b',
          prNumber: 700,
          status: 'open',
        },
      ],
      { repository: 'org/repo', highlightPrNumber: 700 }
    )
    expect(markdown).toContain('### Stack')
    expect(markdown).toContain('#681')
    expect(markdown).toContain('#700')
    expect(markdown).toContain('← tip')
    expect(markdown).toContain('v0.7.57')
    expect(markdown).toContain('Tip-only landing')
  })
})

import {
  commitsSince,
  readState,
  runGit,
  upstreamBranch,
  upstreamHeadSha,
  upstreamRemote,
  type SyncState,
  type UpstreamCommit,
} from './config'

export type BaselineSource = 'lastSyncedUpstreamSha' | 'merge-base'

export interface AnalysisBaseline {
  baselineSha: string
  baselineSource: BaselineSource
  targetBranch: string
  upstreamHeadSha: string
  mergeBaseSha: string
}

export function gitMergeBase(refA: string, refB: string): string {
  return runGit(['merge-base', refA, refB])
}

export function isAncestor(ancestor: string, descendant: string): boolean {
  try {
    runGit(['merge-base', '--is-ancestor', ancestor, descendant])
    return true
  } catch {
    return false
  }
}

/**
 * Resolve the commit range used for FBI reports, release notes, and agent context.
 * Falls back to git merge-base when persisted lastSyncedUpstreamSha is missing or stale.
 *
 * Baseline SHAs must be ancestors of upstream HEAD. Fork-only merge commits that share a
 * message with an upstream release (e.g. a local `v0.7.28` merge) must never bound the range —
 * `git log forkMerge..upstream` inflates the commit list.
 */
export function resolveAnalysisBaseline(targetBranch: string, state?: SyncState): AnalysisBaseline {
  const syncState = state ?? readState()
  const headSha = upstreamHeadSha()
  const upstreamRef = `${upstreamRemote()}/${upstreamBranch()}`

  let mergeBaseSha = headSha
  try {
    mergeBaseSha = gitMergeBase(targetBranch, upstreamRef)
  } catch {
    console.warn(
      `Could not compute merge-base between ${targetBranch} and ${upstreamRef}; using upstream HEAD.`
    )
  }

  if (!isAncestor(mergeBaseSha, headSha)) {
    console.warn(
      `merge-base ${mergeBaseSha.slice(0, 8)} is not an ancestor of upstream HEAD ${headSha.slice(0, 8)} — refusing it as analysis baseline.`
    )
    mergeBaseSha = headSha
  }

  const lastSynced = syncState.lastSyncedUpstreamSha
  if (lastSynced && isAncestor(lastSynced, headSha)) {
    // Prefer the newer of lastSynced vs merge-base so we never re-analyze already-shared history.
    const baselineSha = isAncestor(mergeBaseSha, lastSynced) ? lastSynced : mergeBaseSha
    const baselineSource: BaselineSource =
      baselineSha === lastSynced ? 'lastSyncedUpstreamSha' : 'merge-base'
    if (baselineSha !== lastSynced) {
      console.warn(
        `lastSyncedUpstreamSha ${lastSynced.slice(0, 8)} is behind merge-base ${mergeBaseSha.slice(0, 8)} — using merge-base.`
      )
    }
    return {
      baselineSha,
      baselineSource,
      targetBranch,
      upstreamHeadSha: headSha,
      mergeBaseSha,
    }
  }

  if (lastSynced) {
    console.warn(
      `lastSyncedUpstreamSha ${lastSynced.slice(0, 8)} is not an ancestor of upstream HEAD — using merge-base ${mergeBaseSha.slice(0, 8)}.`
    )
  }

  return {
    baselineSha: mergeBaseSha,
    baselineSource: 'merge-base',
    targetBranch,
    upstreamHeadSha: headSha,
    mergeBaseSha,
  }
}

export function commitsSinceBaseline(baseline: AnalysisBaseline): UpstreamCommit[] {
  return commitsSince(baseline.baselineSha, baseline.upstreamHeadSha)
}

/**
 * Cap the upstream merge tip for smoke tests / incremental syncs.
 *
 * Env (checked in order):
 * - `UPSTREAM_SYNC_UNTIL_SHA` — exact upstream commit to merge through
 * - `UPSTREAM_SYNC_MAX_COMMITS` — positive integer; take the Nth commit after baseline
 *
 * Returns the full upstream HEAD when unset / invalid / zero.
 */
export function resolveCappedUpstreamTip(
  baseline: AnalysisBaseline,
  options?: { untilSha?: string | null; maxCommits?: number | null }
): { tipSha: string; capped: boolean; commitCount: number; reason: string } {
  const untilSha = (options?.untilSha ?? process.env.UPSTREAM_SYNC_UNTIL_SHA ?? '').trim()
  const maxCommitsRaw =
    options?.maxCommits ??
    (process.env.UPSTREAM_SYNC_MAX_COMMITS ? Number(process.env.UPSTREAM_SYNC_MAX_COMMITS) : 0)
  const maxCommits =
    typeof maxCommitsRaw === 'number' && Number.isFinite(maxCommitsRaw)
      ? Math.floor(maxCommitsRaw)
      : 0

  const fullTip = baseline.upstreamHeadSha
  const commits = commitsSince(baseline.baselineSha, fullTip)

  if (untilSha) {
    if (!isAncestor(baseline.baselineSha, untilSha) && untilSha !== baseline.baselineSha) {
      throw new Error(
        `UPSTREAM_SYNC_UNTIL_SHA ${untilSha.slice(0, 8)} is not a descendant of baseline ${baseline.baselineSha.slice(0, 8)}`
      )
    }
    if (!isAncestor(untilSha, fullTip) && untilSha !== fullTip) {
      throw new Error(
        `UPSTREAM_SYNC_UNTIL_SHA ${untilSha.slice(0, 8)} is not an ancestor of upstream HEAD ${fullTip.slice(0, 8)}`
      )
    }
    const cappedCommits = commitsSince(baseline.baselineSha, untilSha)
    return {
      tipSha: untilSha,
      capped: untilSha !== fullTip,
      commitCount: cappedCommits.length,
      reason: `until-sha ${untilSha.slice(0, 8)}`,
    }
  }

  if (maxCommits > 0 && commits.length > maxCommits) {
    const tipSha = commits[maxCommits - 1].sha
    return {
      tipSha,
      capped: true,
      commitCount: maxCommits,
      reason: `max-commits=${maxCommits}`,
    }
  }

  return {
    tipSha: fullTip,
    capped: false,
    commitCount: commits.length,
    reason: 'full upstream HEAD',
  }
}

export function formatBaselineMetadata(baseline: AnalysisBaseline, commitCount: number): string {
  return [
    `- **Target branch:** \`${baseline.targetBranch}\``,
    `- **Upstream HEAD:** \`${baseline.upstreamHeadSha.slice(0, 8)}\``,
    `- **Merge-base (target ↔ upstream):** \`${baseline.mergeBaseSha.slice(0, 8)}\``,
    `- **Analysis baseline:** \`${baseline.baselineSha.slice(0, 8)}\` (${baseline.baselineSource})`,
    `- **Commits in sync range:** ${commitCount}`,
  ].join('\n')
}

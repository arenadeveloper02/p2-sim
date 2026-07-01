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

  const lastSynced = syncState.lastSyncedUpstreamSha
  if (lastSynced && isAncestor(lastSynced, headSha)) {
    return {
      baselineSha: lastSynced,
      baselineSource: 'lastSyncedUpstreamSha',
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

export function formatBaselineMetadata(baseline: AnalysisBaseline, commitCount: number): string {
  return [
    `- **Target branch:** \`${baseline.targetBranch}\``,
    `- **Upstream HEAD:** \`${baseline.upstreamHeadSha.slice(0, 8)}\``,
    `- **Merge-base (target ↔ upstream):** \`${baseline.mergeBaseSha.slice(0, 8)}\``,
    `- **Analysis baseline:** \`${baseline.baselineSha.slice(0, 8)}\` (${baseline.baselineSource})`,
    `- **Commits in sync range:** ${commitCount}`,
  ].join('\n')
}

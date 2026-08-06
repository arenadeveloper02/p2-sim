import {
  commitsSince,
  detectReleaseVersions,
  readState,
  runGit,
  type SyncState,
  type UpstreamCommit,
  upstreamBranch,
  upstreamHeadSha,
  upstreamRemote,
} from './config'

export const WAITING_FOR_NEXT_RELEASE = 'waiting for next upstream release'

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

export type NextReleaseTip =
  | {
      kind: 'release'
      tipSha: string
      version: string
      commitCount: number
    }
  | {
      kind: 'noop'
      reason: string
    }

/**
 * First upstream release commit after baseline (`vX.Y.Z:` title convention).
 * No release in range → noop (do not advance to full HEAD).
 */
export function resolveNextReleaseTip(
  baseline: Pick<AnalysisBaseline, 'baselineSha' | 'upstreamHeadSha'>,
  commits: UpstreamCommit[] = commitsSince(baseline.baselineSha, baseline.upstreamHeadSha)
): NextReleaseTip {
  const batch = resolveReleaseBatchTip(baseline, commits, 1)
  if (batch.kind === 'noop') return batch
  return {
    kind: 'release',
    tipSha: batch.tipSha,
    version: batch.version,
    commitCount: batch.commitCount,
  }
}

/** Default number of upstream release tips to merge per Actions run. */
export const DEFAULT_MIN_RELEASES = 6

/** Resolve `UPSTREAM_SYNC_MIN_RELEASES` (default 6, minimum 1). */
export function resolveMinReleases(override?: number | null): number {
  if (typeof override === 'number' && Number.isFinite(override) && override >= 1) {
    return Math.floor(override)
  }
  const raw = process.env.UPSTREAM_SYNC_MIN_RELEASES?.trim()
  if (!raw) return DEFAULT_MIN_RELEASES
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_MIN_RELEASES
  return Math.floor(parsed)
}

/** Human label for a release batch (`v0.7.30` or `v0.7.30…v0.7.35`). */
export function formatReleaseBatchLabel(versions: readonly string[]): string {
  if (versions.length === 0) return ''
  if (versions.length === 1) return versions[0] ?? ''
  return `${versions[0]}…${versions[versions.length - 1]}`
}

export type ReleaseBatchTip =
  | {
      kind: 'release'
      tipSha: string
      /** Last release version in the batch (or sole version). */
      version: string
      versions: string[]
      releaseCount: number
      commitCount: number
    }
  | {
      kind: 'noop'
      reason: string
    }

/**
 * Merge tip for the next batch of upstream releases.
 * Takes `min(minReleases, remaining releases)` release tips — never past upstream HEAD,
 * never a mid-release commit.
 */
export function resolveReleaseBatchTip(
  baseline: Pick<AnalysisBaseline, 'baselineSha' | 'upstreamHeadSha'>,
  commits: UpstreamCommit[] = commitsSince(baseline.baselineSha, baseline.upstreamHeadSha),
  minReleases: number = resolveMinReleases()
): ReleaseBatchTip {
  const releases = detectReleaseVersions(commits).filter((entry) => entry.releaseCommitSha)
  if (releases.length === 0) {
    return { kind: 'noop', reason: WAITING_FOR_NEXT_RELEASE }
  }

  const count = Math.min(Math.max(1, Math.floor(minReleases)), releases.length)
  const selected = releases.slice(0, count)
  const last = selected[selected.length - 1]
  const tipSha = last.releaseCommitSha as string
  const versions = selected.map((entry) => entry.version)
  const tipIndex = commits.findIndex((commit) => commit.sha === tipSha)
  const commitCount =
    tipIndex >= 0 ? tipIndex + 1 : commitsSince(baseline.baselineSha, tipSha).length

  return {
    kind: 'release',
    tipSha,
    version: last.version,
    versions,
    releaseCount: selected.length,
    commitCount,
  }
}

export type CappedUpstreamTip =
  | {
      kind: 'merge'
      tipSha: string
      capped: boolean
      commitCount: number
      reason: string
      version?: string
    }
  | {
      kind: 'noop'
      tipSha: null
      commitCount: 0
      reason: string
    }

export interface ResolveCappedUpstreamTipOptions {
  untilSha?: string | null
  maxCommits?: number | null
  /** Minimum upstream release tips to merge in one slice (default 6 / env). */
  minReleases?: number | null
  /** Resume lock: stay on this release tip instead of a newer one. */
  activeUpstreamSha?: string | null
  /** Injected commit list (oldest → newest). Skips git log / ancestor checks. */
  commits?: UpstreamCommit[]
}

/**
 * Cap the upstream merge tip to a batch of release tips by default (min 6).
 *
 * Escapes (checked in order, override release-batch):
 * - `untilSha` / `UPSTREAM_SYNC_UNTIL_SHA` — exact upstream commit to merge through
 * - `maxCommits` / `UPSTREAM_SYNC_MAX_COMMITS` — positive integer; take the Nth commit after baseline
 * - `activeUpstreamSha` — persisted tip for resume (same tip, not a newer one)
 *
 * `maxCommits` 0 / unset is **not** "merge all of main" — it uses the release batch tip.
 * No new release and no escape → noop (`waiting for next upstream release`).
 */
export function resolveCappedUpstreamTip(
  baseline: AnalysisBaseline,
  options?: ResolveCappedUpstreamTipOptions
): CappedUpstreamTip {
  const untilSha = (
    options && 'untilSha' in options
      ? (options.untilSha ?? '')
      : (process.env.UPSTREAM_SYNC_UNTIL_SHA ?? '')
  ).trim()
  const maxCommitsRaw =
    options && 'maxCommits' in options
      ? options.maxCommits
      : process.env.UPSTREAM_SYNC_MAX_COMMITS
        ? Number(process.env.UPSTREAM_SYNC_MAX_COMMITS)
        : 0
  const maxCommits =
    typeof maxCommitsRaw === 'number' && Number.isFinite(maxCommitsRaw)
      ? Math.floor(maxCommitsRaw)
      : 0
  const activeUpstreamSha = (
    options && 'activeUpstreamSha' in options ? (options.activeUpstreamSha ?? '') : ''
  ).trim()
  const minReleases = resolveMinReleases(
    options && 'minReleases' in options ? options.minReleases : undefined
  )

  const fullTip = baseline.upstreamHeadSha
  const commits = options?.commits ?? commitsSince(baseline.baselineSha, fullTip)

  if (untilSha) {
    if (!options?.commits) {
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
    } else {
      const known = new Set([baseline.baselineSha, fullTip, ...commits.map((commit) => commit.sha)])
      if (!known.has(untilSha)) {
        throw new Error(
          `UPSTREAM_SYNC_UNTIL_SHA ${untilSha.slice(0, 8)} is not in the provided commit range`
        )
      }
    }

    const untilIndex = commits.findIndex((commit) => commit.sha === untilSha)
    const commitCount =
      untilSha === baseline.baselineSha
        ? 0
        : untilIndex >= 0
          ? untilIndex + 1
          : untilSha === fullTip
            ? commits.length
            : options?.commits
              ? 0
              : commitsSince(baseline.baselineSha, untilSha).length

    return {
      kind: 'merge',
      tipSha: untilSha,
      capped: untilSha !== fullTip,
      commitCount,
      reason: `until-sha ${untilSha.slice(0, 8)}`,
    }
  }

  if (maxCommits > 0 && commits.length > 0) {
    const count = Math.min(maxCommits, commits.length)
    const tipSha = commits[count - 1].sha
    return {
      kind: 'merge',
      tipSha,
      capped: tipSha !== fullTip,
      commitCount: count,
      reason: `max-commits=${maxCommits}`,
    }
  }

  if (activeUpstreamSha) {
    const activeIndex = commits.findIndex((commit) => commit.sha === activeUpstreamSha)
    if (
      activeIndex >= 0 ||
      activeUpstreamSha === fullTip ||
      activeUpstreamSha === baseline.baselineSha
    ) {
      const commitCount =
        activeUpstreamSha === baseline.baselineSha
          ? 0
          : activeIndex >= 0
            ? activeIndex + 1
            : commits.length
      return {
        kind: 'merge',
        tipSha: activeUpstreamSha,
        capped: activeUpstreamSha !== fullTip,
        commitCount,
        reason: `active-upstream-sha ${activeUpstreamSha.slice(0, 8)}`,
      }
    }
    console.warn(
      `activeUpstreamSha ${activeUpstreamSha.slice(0, 8)} is not in baseline..upstream HEAD — falling back to release batch.`
    )
  }

  const batch = resolveReleaseBatchTip(baseline, commits, minReleases)
  if (batch.kind === 'noop') {
    return {
      kind: 'noop',
      tipSha: null,
      commitCount: 0,
      reason: batch.reason,
    }
  }

  const label = formatReleaseBatchLabel(batch.versions)
  return {
    kind: 'merge',
    tipSha: batch.tipSha,
    capped: batch.tipSha !== fullTip,
    commitCount: batch.commitCount,
    reason: `next-releases ${label} (n=${batch.releaseCount})`,
    version: label,
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

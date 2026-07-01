import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import {
  MERGE_POLICY_PATH,
  listConflictFiles,
  runGit,
} from './config'

const PACKAGE_MANIFEST_PATTERN = /(?:^|\/)package\.json$/
const LOCKFILE_PATH = 'bun.lock'
const CONFLICT_MARKER_PATTERN = /^<{7}|^={7}|^>{7}/m

interface MergePolicy {
  forkFirst?: string[]
  upstreamFirst?: string[]
}

function readMergePolicy(): MergePolicy {
  try {
    return JSON.parse(readFileSync(MERGE_POLICY_PATH, 'utf8')) as MergePolicy
  } catch {
    return {}
  }
}

function isForkFirstPath(filePath: string, policy: MergePolicy): boolean {
  return policy.forkFirst?.some((prefix) => filePath.startsWith(prefix)) ?? false
}

function isUpstreamFirstPath(filePath: string, policy: MergePolicy): boolean {
  return policy.upstreamFirst?.some((prefix) => filePath.startsWith(prefix)) ?? false
}

/** Pick merge side for deterministic conflict resolution before agent work. */
export function conflictResolutionSide(filePath: string): 'ours' | 'theirs' {
  const policy = readMergePolicy()
  if (isForkFirstPath(filePath, policy)) return 'ours'
  if (isUpstreamFirstPath(filePath, policy)) return 'theirs'

  if (
    filePath === LOCKFILE_PATH ||
    filePath === 'package.json' ||
    filePath.endsWith('/package.json')
  ) {
    return 'theirs'
  }

  return 'ours'
}

export function isPackageManifest(filePath: string): boolean {
  return PACKAGE_MANIFEST_PATTERN.test(filePath)
}

export function listPackageManifestConflicts(conflicts: string[]): string[] {
  return conflicts.filter(isPackageManifest)
}

export function hasLockfileConflict(conflicts: string[]): boolean {
  return conflicts.includes(LOCKFILE_PATH)
}

/** True when bun.lock contains unresolved merge conflict markers. */
export function lockfileHasConflictMarkers(path = LOCKFILE_PATH): boolean {
  if (!existsSync(path)) return false
  try {
    return CONFLICT_MARKER_PATTERN.test(readFileSync(path, 'utf8'))
  } catch {
    return false
  }
}

export function mergeInProgress(): boolean {
  return existsSync('.git/MERGE_HEAD')
}

export function needsPackageManagerBootstrap(): boolean {
  const conflicts = listConflictFiles()
  return (
    mergeInProgress() ||
    hasLockfileConflict(conflicts) ||
    listPackageManifestConflicts(conflicts).length > 0 ||
    lockfileHasConflictMarkers()
  )
}

function checkoutConflictSide(filePath: string, side: 'ours' | 'theirs'): void {
  runGit(['checkout', side === 'ours' ? '--ours' : '--theirs', '--', filePath])
  runGit(['add', filePath])
}

function hasStagedChanges(): boolean {
  try {
    runGit(['diff', '--cached', '--quiet'])
    return false
  } catch {
    return true
  }
}

function removeLockfile(): void {
  if (!existsSync(LOCKFILE_PATH)) return
  try {
    runGit(['rm', '-f', LOCKFILE_PATH])
  } catch {
    unlinkSync(LOCKFILE_PATH)
  }
}

/**
 * Resolve package manifest conflicts and regenerate bun.lock so Sandcastle can start.
 * Safe to call repeatedly — no-ops when the workspace is already installable.
 */
export function ensureInstallableWorkspace(runId: string): boolean {
  if (!needsPackageManagerBootstrap()) return true

  const conflicts = listConflictFiles()
  const manifestConflicts = listPackageManifestConflicts(conflicts)
  const lockConflict = hasLockfileConflict(conflicts) || lockfileHasConflictMarkers()

  console.log(
    `[lockfile-bootstrap] Ensuring installable workspace` +
      `${manifestConflicts.length > 0 ? ` (${manifestConflicts.length} manifest conflict(s))` : ''}` +
      `${lockConflict ? ' + bun.lock regenerate' : ''}.`
  )

  for (const file of manifestConflicts) {
    checkoutConflictSide(file, conflictResolutionSide(file))
  }

  if (lockConflict) {
    removeLockfile()
  }

  if (lockConflict || manifestConflicts.length > 0) {
    execFileSync('bun', ['install'], { stdio: 'inherit' })
    runGit(['add', LOCKFILE_PATH, ...manifestConflicts])

    if (hasStagedChanges()) {
      if (mergeInProgress()) {
        console.log(
          '[lockfile-bootstrap] Staged package manager files; merge still in progress — skipping commit until all conflicts resolve.'
        )
      } else {
        runGit(['commit', '-m', `upstream-sync(${runId}): bootstrap package manager after merge`])
      }
    }
  }

  if (lockfileHasConflictMarkers()) {
    console.error('[lockfile-bootstrap] bun.lock still contains conflict markers after bootstrap.')
    return false
  }

  return true
}

/** @deprecated Use ensureInstallableWorkspace */
export const bootstrapPackageManagerBeforeAgents = ensureInstallableWorkspace

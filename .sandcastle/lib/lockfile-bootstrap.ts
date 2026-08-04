import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync } from 'node:fs'
import {
  MERGE_POLICY_PATH,
  commitHarness,
  listConflictFiles,
  runGit,
} from './config'

const PACKAGE_MANIFEST_PATTERN = /(?:^|\/)package\.json$/
const LOCKFILE_PATH = 'bun.lock'
const BUNFIG_PATH = 'bunfig.toml'
const CONFLICT_MARKER_PATTERN = /^<{7}|^={7}|^>{7}/m
/** Mid-merge lockfile regen must not inherit upstream's 7-day release gate. */
const BUN_INSTALL_ARGS = ['install', '--minimum-release-age=0'] as const

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

  // Fork keeps a disabled release-age gate so mid-merge `bun install` can resolve
  // freshly published upstream pins (upstream bunfig defaults to 7 days).
  if (filePath === BUNFIG_PATH) {
    return 'ours'
  }

  return 'ours'
}

/**
 * Side to apply without an agent, or `null` when the path needs semantic merge.
 * Unlike {@link conflictResolutionSide}, this does **not** default ambiguous paths to ours.
 */
export function tryDeterministicConflictSide(filePath: string): 'ours' | 'theirs' | null {
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

  if (filePath === BUNFIG_PATH) {
    return 'ours'
  }

  return null
}

/**
 * Checkout `--ours`/`--theirs` for every unmerged path with a deterministic policy side.
 * Returns the files that still need an agent.
 */
export function resolveDeterministicPolicyConflicts(conflictFiles?: string[]): {
  resolved: string[]
  remaining: string[]
} {
  const conflicts = conflictFiles ?? listConflictFiles()
  const resolved: string[] = []
  const remaining: string[] = []

  for (const file of conflicts) {
    const side = tryDeterministicConflictSide(file)
    if (!side) {
      remaining.push(file)
      continue
    }
    try {
      checkoutConflictSide(file, side)
      resolved.push(file)
      console.log(`[policy-resolve] ${side} ← ${file}`)
    } catch (error) {
      console.warn(`[policy-resolve] failed for ${file}; leaving for agent:`, error)
      remaining.push(file)
    }
  }

  return { resolved, remaining }
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

export function hasBunfigConflict(conflicts: string[]): boolean {
  return conflicts.includes(BUNFIG_PATH)
}

/** True when a file contains unresolved merge conflict markers. */
export function fileHasConflictMarkers(path: string): boolean {
  if (!existsSync(path)) return false
  try {
    return CONFLICT_MARKER_PATTERN.test(readFileSync(path, 'utf8'))
  } catch {
    return false
  }
}

/** True when bun.lock contains unresolved merge conflict markers. */
export function lockfileHasConflictMarkers(path = LOCKFILE_PATH): boolean {
  return fileHasConflictMarkers(path)
}

export function mergeInProgress(): boolean {
  return existsSync('.git/MERGE_HEAD')
}

export function needsPackageManagerBootstrap(): boolean {
  const conflicts = listConflictFiles()
  return (
    mergeInProgress() ||
    hasLockfileConflict(conflicts) ||
    hasBunfigConflict(conflicts) ||
    listPackageManifestConflicts(conflicts).length > 0 ||
    lockfileHasConflictMarkers() ||
    fileHasConflictMarkers(BUNFIG_PATH)
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
 * Resolve package manifest / bunfig conflicts and regenerate bun.lock so Sandcastle can start.
 * Safe to call repeatedly — no-ops when the workspace is already installable.
 */
export function ensureInstallableWorkspace(runId: string): boolean {
  if (!needsPackageManagerBootstrap()) return true

  const conflicts = listConflictFiles()
  const manifestConflicts = listPackageManifestConflicts(conflicts)
  const bunfigConflict = hasBunfigConflict(conflicts) || fileHasConflictMarkers(BUNFIG_PATH)
  const lockConflict = hasLockfileConflict(conflicts) || lockfileHasConflictMarkers()

  console.log(
    `[lockfile-bootstrap] Ensuring installable workspace` +
      `${manifestConflicts.length > 0 ? ` (${manifestConflicts.length} manifest conflict(s))` : ''}` +
      `${bunfigConflict ? ' + bunfig.toml' : ''}` +
      `${lockConflict ? ' + bun.lock regenerate' : ''}.`
  )

  for (const file of manifestConflicts) {
    checkoutConflictSide(file, conflictResolutionSide(file))
  }

  if (bunfigConflict) {
    if (conflicts.includes(BUNFIG_PATH)) {
      checkoutConflictSide(BUNFIG_PATH, conflictResolutionSide(BUNFIG_PATH))
    } else {
      // Markers present but not listed as unmerged (rare) — prefer fork side.
      try {
        runGit(['checkout', '--ours', '--', BUNFIG_PATH])
        runGit(['add', BUNFIG_PATH])
      } catch {
        console.warn('[lockfile-bootstrap] Could not reset bunfig.toml to ours')
      }
    }
  }

  if (lockConflict) {
    removeLockfile()
  }

  if (lockConflict || manifestConflicts.length > 0 || bunfigConflict) {
    // Explicit CLI override: conflicted/upstream bunfig may still set a 7-day gate.
    console.log(`[lockfile-bootstrap] Running bun ${BUN_INSTALL_ARGS.join(' ')}`)
    execFileSync('bun', [...BUN_INSTALL_ARGS], { stdio: 'inherit' })
    const stagedPaths = [LOCKFILE_PATH, ...manifestConflicts]
    if (existsSync(BUNFIG_PATH)) stagedPaths.push(BUNFIG_PATH)
    runGit(['add', ...stagedPaths])

    if (hasStagedChanges()) {
      if (mergeInProgress()) {
        console.log(
          '[lockfile-bootstrap] Staged package manager files; merge still in progress — skipping commit until all conflicts resolve.'
        )
      } else {
        commitHarness(`upstream-sync(${runId}): bootstrap package manager after merge`)
      }
    }
  }

  if (lockfileHasConflictMarkers()) {
    console.error('[lockfile-bootstrap] bun.lock still contains conflict markers after bootstrap.')
    return false
  }

  if (fileHasConflictMarkers(BUNFIG_PATH)) {
    console.error('[lockfile-bootstrap] bunfig.toml still contains conflict markers after bootstrap.')
    return false
  }

  return true
}

/** @deprecated Use ensureInstallableWorkspace */
export const bootstrapPackageManagerBeforeAgents = ensureInstallableWorkspace

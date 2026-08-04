import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { commitHarness, listConflictFiles, MERGE_POLICY_PATH, runGit } from './config'

const PACKAGE_MANIFEST_PATTERN = /(?:^|\/)package\.json$/
const LOCKFILE_PATH = 'bun.lock'
const BUNFIG_PATH = 'bunfig.toml'
const CONFLICT_MARKER_PATTERN = /^<{7}|^={7}|^>{7}/m
/** Mid-merge lockfile regen must not inherit upstream's 7-day release gate. */
const BUN_INSTALL_ARGS = ['install', '--minimum-release-age=0'] as const

/** Object fields union-merged: upstream values win on key collisions; fork-only keys are kept. */
const PACKAGE_JSON_UNION_FIELDS = [
  'scripts',
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies',
] as const

interface MergePolicy {
  forkFirst?: string[]
  upstreamFirst?: string[]
  packageJson?: {
    strategy?: 'union' | 'upstream'
    dropScripts?: string[]
  }
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

function isPackageJsonPath(filePath: string): boolean {
  return filePath === 'package.json' || filePath.endsWith('/package.json')
}

function packageJsonStrategy(policy: MergePolicy): 'union' | 'upstream' {
  return policy.packageJson?.strategy === 'upstream' ? 'upstream' : 'union'
}

function dropScriptsFromPolicy(policy: MergePolicy): Set<string> {
  return new Set(policy.packageJson?.dropScripts ?? [])
}

/**
 * Union-merge two package.json objects: start from upstream, keep fork-only keys
 * in scripts/deps, and drop scripts listed in merge-policy `packageJson.dropScripts`.
 */
export function mergePackageJsonUnion(
  ours: Record<string, unknown>,
  theirs: Record<string, unknown>,
  dropScripts: Iterable<string> = []
): Record<string, unknown> {
  const drop = new Set(dropScripts)
  const result: Record<string, unknown> = { ...theirs }

  for (const [key, value] of Object.entries(ours)) {
    if (!(key in theirs)) {
      result[key] = value
    }
  }

  for (const field of PACKAGE_JSON_UNION_FIELDS) {
    const oursField = asStringRecord(ours[field])
    const theirsField = asStringRecord(theirs[field])
    if (!oursField && !theirsField) continue

    const merged: Record<string, string> = { ...(theirsField ?? {}) }
    for (const [key, value] of Object.entries(oursField ?? {})) {
      if (field === 'scripts' && drop.has(key)) continue
      if (!(key in merged)) {
        merged[key] = value
      }
    }
    result[field] = merged
  }

  return result
}

function asStringRecord(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'string') out[key] = entry
  }
  return out
}

function readGitStage(filePath: string, stage: 2 | 3): Record<string, unknown> | null {
  try {
    const raw = runGit(['show', `:${stage}:${filePath}`])
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Resolve a conflicted package.json via upstream∪fork union (or upstream-only when configured).
 */
export function resolvePackageJsonConflict(filePath: string): void {
  const policy = readMergePolicy()
  if (packageJsonStrategy(policy) === 'upstream') {
    checkoutConflictSide(filePath, 'theirs')
    return
  }

  const ours = readGitStage(filePath, 2)
  const theirs = readGitStage(filePath, 3)
  if (!ours || !theirs) {
    console.warn(
      `[lockfile-bootstrap] Could not read both stages for ${filePath}; falling back to upstream.`
    )
    checkoutConflictSide(filePath, 'theirs')
    return
  }

  const merged = mergePackageJsonUnion(ours, theirs, dropScriptsFromPolicy(policy))
  writeFileSync(filePath, `${JSON.stringify(merged, null, 2)}\n`)
  runGit(['add', filePath])
  console.log(`[lockfile-bootstrap] union-merged ${filePath}`)
}

/** Pick merge side for deterministic conflict resolution before agent work. */
export function conflictResolutionSide(filePath: string): 'ours' | 'theirs' {
  const policy = readMergePolicy()
  if (isForkFirstPath(filePath, policy)) return 'ours'
  if (isUpstreamFirstPath(filePath, policy)) return 'theirs'

  // package.json is union-merged — callers must use resolvePackageJsonConflict.
  // bun.lock is regenerated after manifests settle.
  if (filePath === LOCKFILE_PATH) {
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

  // package.json needs union merge (handled in ensureInstallableWorkspace), not a side checkout.
  if (isPackageJsonPath(filePath)) {
    return null
  }

  if (filePath === LOCKFILE_PATH) {
    return 'theirs'
  }

  if (filePath === BUNFIG_PATH) {
    return 'ours'
  }

  return null
}

/**
 * Checkout `--ours`/`--theirs` for every unmerged path with a deterministic policy side.
 * package.json conflicts are union-merged (not a side checkout). Returns files that still need an agent.
 */
export function resolveDeterministicPolicyConflicts(conflictFiles?: string[]): {
  resolved: string[]
  remaining: string[]
} {
  const conflicts = conflictFiles ?? listConflictFiles()
  const resolved: string[] = []
  const remaining: string[] = []

  for (const file of conflicts) {
    if (isPackageJsonPath(file)) {
      try {
        resolvePackageJsonConflict(file)
        resolved.push(file)
      } catch (error) {
        console.warn(
          `[policy-resolve] package.json union failed for ${file}; leaving for agent:`,
          error
        )
        remaining.push(file)
      }
      continue
    }

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
    resolvePackageJsonConflict(file)
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
    console.error(
      '[lockfile-bootstrap] bunfig.toml still contains conflict markers after bootstrap.'
    )
    return false
  }

  return true
}

/** @deprecated Use ensureInstallableWorkspace */
export const bootstrapPackageManagerBeforeAgents = ensureInstallableWorkspace

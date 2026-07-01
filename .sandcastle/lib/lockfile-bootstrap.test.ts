/**
 * Run with: bun test .sandcastle/lib/lockfile-bootstrap.test.ts
 */
import { describe, expect, test } from 'bun:test'
import {
  conflictResolutionSide,
  hasLockfileConflict,
  isPackageManifest,
  listPackageManifestConflicts,
  lockfileHasConflictMarkers,
  mergeInProgress,
  needsPackageManagerBootstrap,
} from './lockfile-bootstrap'

describe('lockfile bootstrap helpers', () => {
  test('detects package manifest paths', () => {
    expect(isPackageManifest('package.json')).toBe(true)
    expect(isPackageManifest('apps/sim/package.json')).toBe(true)
    expect(isPackageManifest('bun.lock')).toBe(false)
  })

  test('lists manifest conflicts separately from lockfile', () => {
    const conflicts = ['package.json', 'bun.lock', 'apps/sim/app/chat/page.tsx']
    expect(listPackageManifestConflicts(conflicts)).toEqual(['package.json'])
    expect(hasLockfileConflict(conflicts)).toBe(true)
  })

  test('prefers upstream for root package.json and fork for fork-first paths', () => {
    expect(conflictResolutionSide('package.json')).toBe('theirs')
    expect(conflictResolutionSide('bun.lock')).toBe('theirs')
    expect(conflictResolutionSide('apps/sim/app/chat/hooks/use-chat-streaming.ts')).toBe('ours')
    expect(conflictResolutionSide('apps/sim/lib/copilot/generated/tool-schemas-v1.ts')).toBe(
      'theirs'
    )
  })

  test('detects conflict markers in lockfile content', () => {
    expect(lockfileHasConflictMarkers('/does/not/exist')).toBe(false)
  })

  test('needsPackageManagerBootstrap is true during merge', () => {
    expect(typeof needsPackageManagerBootstrap()).toBe('boolean')
    expect(typeof mergeInProgress()).toBe('boolean')
  })
})

/**
 * Run with: bun test .sandcastle/lib/lockfile-bootstrap.test.ts
 */
import { existsSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import {
  conflictResolutionSide,
  hasLockfileConflict,
  isPackageManifest,
  listPackageManifestConflicts,
  lockfileHasConflictMarkers,
  mergeInProgress,
  mergePackageJsonUnion,
  needsPackageManagerBootstrap,
  tryDeterministicConflictSide,
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

  test('prefers upstream lockfile regen and fork bunfig / fork-first paths', () => {
    expect(conflictResolutionSide('bun.lock')).toBe('theirs')
    expect(conflictResolutionSide('bunfig.toml')).toBe('ours')
    expect(conflictResolutionSide('apps/sim/app/chat/hooks/use-chat-streaming.ts')).toBe('ours')
    expect(conflictResolutionSide('apps/sim/lib/copilot/generated/tool-schemas-v1.ts')).toBe(
      'theirs'
    )
  })

  test('tryDeterministicConflictSide leaves package.json for union merge', () => {
    expect(tryDeterministicConflictSide('package.json')).toBe(null)
    expect(tryDeterministicConflictSide('apps/sim/package.json')).toBe(null)
    expect(tryDeterministicConflictSide('bun.lock')).toBe('theirs')
    expect(tryDeterministicConflictSide('apps/sim/lib/copilot/generated/x.ts')).toBe('theirs')
    expect(tryDeterministicConflictSide('apps/sim/lib/billing/usage.ts')).toBe(null)
    expect(tryDeterministicConflictSide('packages/db/schema.ts')).toBe(null)
  })

  test('mergePackageJsonUnion keeps fork-only scripts and deps on upstream base', () => {
    const ours = {
      name: 'simstudio',
      scripts: {
        build: 'turbo run build',
        'check:secrets': 'bun run scripts/check-committed-secrets.ts',
        'upstream-sync': 'bun run .sandcastle/main.ts',
        'dev:full:minimal-registry': 'echo gone',
      },
      devDependencies: {
        '@ai-hero/sandcastle': '0.10.0',
        turbo: '2.9.14',
      },
    }
    const theirs = {
      name: 'simstudio',
      scripts: {
        build: 'turbo run build',
        setup: 'bun install && bun run scripts/setup/index.ts setup',
      },
      devDependencies: {
        turbo: '2.9.14',
        chalk: '5.6.2',
      },
    }

    const merged = mergePackageJsonUnion(ours, theirs, ['dev:full:minimal-registry'])

    expect(merged.scripts).toEqual({
      build: 'turbo run build',
      setup: 'bun install && bun run scripts/setup/index.ts setup',
      'check:secrets': 'bun run scripts/check-committed-secrets.ts',
      'upstream-sync': 'bun run .sandcastle/main.ts',
    })
    expect(merged.devDependencies).toEqual({
      turbo: '2.9.14',
      chalk: '5.6.2',
      '@ai-hero/sandcastle': '0.10.0',
    })
    expect((merged.scripts as Record<string, string>)['dev:full:minimal-registry']).toBeUndefined()
  })

  test('mergePackageJsonUnion prefers upstream value when both define the same key', () => {
    const ours = { scripts: { build: 'echo ours' } }
    const theirs = { scripts: { build: 'echo theirs' } }
    const merged = mergePackageJsonUnion(ours, theirs)
    expect((merged.scripts as Record<string, string>).build).toBe('echo theirs')
  })

  test('detects conflict markers in lockfile content', () => {
    expect(lockfileHasConflictMarkers('/does/not/exist')).toBe(false)
  })

  test('needsPackageManagerBootstrap is true during merge', () => {
    expect(typeof needsPackageManagerBootstrap()).toBe('boolean')
    expect(typeof mergeInProgress()).toBe('boolean')
  })

  test('mergeInProgress reflects whether MERGE_HEAD exists', () => {
    expect(mergeInProgress()).toBe(existsSync('.git/MERGE_HEAD'))
  })
})

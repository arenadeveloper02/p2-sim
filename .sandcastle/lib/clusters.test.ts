/**
 * Run with: bun test .sandcastle/lib/clusters.test.ts
 */
import { describe, expect, test } from 'bun:test'
import {
  countClusterFiles,
  groupConflictClusters,
  leafConflictClusters,
  pathPrefix,
  resolveClusterOptions,
  splitLeftoverCluster,
  walkConflictClusters,
} from './clusters'

describe('pathPrefix', () => {
  test('takes N segments with trailing slash', () => {
    expect(pathPrefix('apps/sim/app/api/chat/route.ts', 4)).toBe('apps/sim/app/api/')
    expect(pathPrefix('apps/sim/app/workspace/page.tsx', 4)).toBe('apps/sim/app/workspace/')
  })

  test('short paths use directory', () => {
    expect(pathPrefix('bun.lock', 4)).toBe('bun.lock/')
    expect(pathPrefix('apps/sim/proxy.ts', 4)).toBe('apps/sim/')
  })
})

describe('groupConflictClusters hierarchy', () => {
  test('splits apps/sim/app into 4-segment children instead of one mega-bucket', () => {
    const files = [
      'apps/sim/app/api/chat/route.ts',
      'apps/sim/app/api/auth/route.ts',
      'apps/sim/app/workspace/[id]/page.tsx',
      'apps/sim/app/(landing)/page.tsx',
      'apps/sim/lib/billing/usage.ts',
      'apps/sim/lib/auth/auth.ts',
    ]
    const forest = groupConflictClusters(files, {
      minPrefixSegments: 4,
      maxFilesPerCluster: 12,
      maxDepth: 5,
    })
    const leaves = leafConflictClusters(forest)
    const prefixes = leaves.map((l) => l.prefix).sort()

    expect(prefixes).toContain('apps/sim/app/api/')
    expect(prefixes).toContain('apps/sim/app/workspace/')
    expect(prefixes).toContain('apps/sim/app/(landing)/')
    expect(prefixes.some((p) => p === 'apps/sim/app/')).toBe(false)
    expect(countClusterFiles(forest)).toBe(files.length)
  })

  test('oversized same-prefix bucket gets nested children then chunks', () => {
    const files = Array.from({ length: 30 }, (_, i) => `apps/sim/lib/foo/file-${i}.ts`)
    const forest = groupConflictClusters(files, {
      minPrefixSegments: 4,
      maxFilesPerCluster: 10,
      maxDepth: 2,
    })
    const leaves = leafConflictClusters(forest)
    expect(leaves.length).toBeGreaterThan(1)
    expect(leaves.every((l) => l.files.length <= 10)).toBe(true)
    expect(countClusterFiles(forest)).toBe(30)
    // Structural parents exist in the walk
    expect(walkConflictClusters(forest).length).toBeGreaterThan(leaves.length)
  })

  test('ids nest as cluster-N.M', () => {
    const files = [
      ...Array.from({ length: 15 }, (_, i) => `apps/sim/app/api/a-${i}.ts`),
      ...Array.from({ length: 15 }, (_, i) => `apps/sim/app/workspace/w-${i}.ts`),
    ]
    const forest = groupConflictClusters(files, {
      minPrefixSegments: 3,
      maxFilesPerCluster: 8,
      maxDepth: 5,
    })
    // With minSegments=3, apps/sim/app/ is one root that splits into children
    expect(forest.length).toBe(1)
    expect(forest[0].id).toBe('cluster-1')
    expect(forest[0].children.length).toBeGreaterThan(0)
    expect(forest[0].children[0].id.startsWith('cluster-1.')).toBe(true)
  })
})

describe('splitLeftoverCluster', () => {
  test('returns nested children for partial leftovers', () => {
    const parent = {
      id: 'cluster-1.2',
      prefix: 'apps/sim/app/api/',
      files: [
        'apps/sim/app/api/chat/route.ts',
        'apps/sim/app/api/auth/route.ts',
        'apps/sim/app/api/billing/route.ts',
        'apps/sim/app/api/files/route.ts',
      ],
      depth: 1,
      parentId: 'cluster-1',
      children: [] as const,
    }
    const leftovers = [
      'apps/sim/app/api/chat/route.ts',
      'apps/sim/app/api/auth/route.ts',
      'apps/sim/app/api/billing/route.ts',
    ]
    const children = splitLeftoverCluster(parent, leftovers, {
      minPrefixSegments: 5,
      maxFilesPerCluster: 12,
      round: 1,
    })
    expect(children.length).toBeGreaterThan(0)
    expect(children.every((c) => c.parentId === 'cluster-1.2')).toBe(true)
    expect(children[0].id.startsWith('cluster-1.2.r1.')).toBe(true)
    expect(countClusterFiles(children)).toBe(3)
  })

  test('returns empty when a single unsplittable leftover leaf remains', () => {
    const parent = {
      id: 'cluster-9',
      prefix: 'apps/sim/ee/',
      files: ['apps/sim/ee/whitelabeling/components/a.tsx'],
      depth: 0,
      parentId: null,
      children: [] as const,
    }
    const children = splitLeftoverCluster(parent, parent.files, { round: 1 })
    expect(children).toEqual([])
  })
})

describe('resolveClusterOptions', () => {
  test('applies defaults', () => {
    const opts = resolveClusterOptions()
    expect(opts.minPrefixSegments).toBe(4)
    expect(opts.maxFilesPerCluster).toBe(12)
    expect(opts.maxDepth).toBe(5)
  })
})

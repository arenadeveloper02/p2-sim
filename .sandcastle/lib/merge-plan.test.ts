/**
 * Run with: bun test .sandcastle/lib/merge-plan.test.ts
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import { groupConflictClusters, leafConflictClusters } from './clusters'
import {
  applyMergeDirectives,
  clustersFromMergePlan,
  collectGrillAnswerIds,
  computeDecisionHash,
  emptyMergeDirectives,
  formatParentPlanSummary,
  loadFinalDirectives,
  parseMergePlanDraft,
  parseMergePlanFinal,
  pathMatchesPrefixes,
  resolveDirectivesForDecisionHash,
  restrictMergeDirectivesToUnmerged,
  validateMergeDirectives,
  validateMergePlanDraft,
  validateMergePlanFinal,
  writeMergePlanDraft,
  writeMergePlanFinal,
} from './merge-plan'

const originalCwd = process.cwd()
let tempDir = ''

afterEach(() => {
  process.chdir(originalCwd)
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = ''
  }
})

const sampleDirectives = {
  delete: ['apps/sim/lib/voice/tts.ts'],
  checkoutTheirs: ['apps/sim/providers/models.ts'],
  checkoutOurs: ['apps/sim/tools/arena/foo.ts'],
  mustEdit: ['apps/sim/app/(landing)/components/ArenaDeployedChat.tsx'],
  overrideForkFirst: ['apps/sim/lib/chat/'],
  notes: 'Drop voice; keep arena chat edits.',
}

const sampleDraft = {
  version: 1 as const,
  runId: '2026-08-05',
  kind: 'draft' as const,
  selfResolutions: [
    {
      decision: 'Keep fork arena tools',
      paths: ['apps/sim/tools/arena/foo.ts'],
      prefixes: ['apps/sim/tools/arena/'],
      strategy: 'ours' as const,
      rationale: 'Fork-only integration',
      cite: 'FBI simstudioai/sim#1',
    },
  ],
  openQuestions: [{ id: 'Q2', question: 'Keep or drop voice?' }],
  childClusters: [
    {
      id: 'billing',
      prefix: 'apps/sim/lib/billing/',
      files: [],
      strategy: 'union' as const,
      notes: 'Union membership helpers once conflicts exist.',
    },
  ],
  proposedDirectives: {
    'Q2-A': { ...sampleDirectives, delete: [], notes: 'Keep voice' },
    'Q2-B': sampleDirectives,
  },
}

const sampleFinal = {
  version: 1 as const,
  runId: '2026-08-05',
  kind: 'final' as const,
  selfResolutions: sampleDraft.selfResolutions,
  openQuestions: [{ id: 'Q2' }],
  childClusters: [
    {
      id: 'chat-voice',
      prefix: 'apps/sim/lib/chat/',
      files: ['apps/sim/lib/chat/index.ts'],
      strategy: 'mustEdit' as const,
      notes: 'Human chose drop-voice.',
    },
    {
      id: 'unplanned',
      prefix: '(unplanned)',
      files: ['leftover.ts'],
      strategy: 'manual' as const,
      notes: 'Unassigned leftover conflicts.',
    },
  ],
  directives: sampleDirectives,
}

describe('pathMatchesPrefixes', () => {
  test('matches file and directory prefixes', () => {
    expect(pathMatchesPrefixes('packages/db/schema.ts', ['packages/db/schema.ts'])).toBe(true)
    expect(pathMatchesPrefixes('apps/sim/lib/chat/foo.ts', ['apps/sim/lib/chat/'])).toBe(true)
    expect(pathMatchesPrefixes('apps/sim/lib/billing/usage.ts', ['apps/sim/lib/chat/'])).toBe(false)
    expect(pathMatchesPrefixes('apps/sim/lib/chat/foo.ts', undefined)).toBe(false)
  })
})

describe('merge directives schema', () => {
  test('accepts a complete directives object', () => {
    expect(validateMergeDirectives(sampleDirectives)).toEqual({ ok: true, value: sampleDirectives })
  })

  test('rejects missing arrays', () => {
    const result = validateMergeDirectives({ notes: 'x' })
    expect(result.ok).toBe(false)
  })
})

describe('merge-plan draft vs final', () => {
  test('parses a draft with proposed directives and empty area files', () => {
    const parsed = parseMergePlanDraft(sampleDraft)
    expect(parsed.kind).toBe('draft')
    expect(parsed.childClusters[0].files).toEqual([])
    expect(parsed.proposedDirectives?.['Q2-B'].delete).toEqual(['apps/sim/lib/voice/tts.ts'])
  })

  test('rejects a draft labeled as final', () => {
    expect(validateMergePlanDraft({ ...sampleDraft, kind: 'final' }).ok).toBe(false)
  })

  test('parses a final plan with locked directives and assigned files', () => {
    const parsed = parseMergePlanFinal(sampleFinal)
    expect(parsed.kind).toBe('final')
    expect(parsed.directives.mustEdit).toContain(
      'apps/sim/app/(landing)/components/ArenaDeployedChat.tsx'
    )
    expect(parsed.childClusters.map((c) => c.id)).toEqual(['chat-voice', 'unplanned'])
  })

  test('rejects final plan without directives', () => {
    const { directives: _directives, ...rest } = sampleFinal
    expect(validateMergePlanFinal(rest).ok).toBe(false)
  })

  test('round-trips draft and final ledger files', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'merge-plan-'))
    process.chdir(tempDir)

    writeMergePlanDraft('2026-08-05', sampleDraft)
    writeMergePlanFinal('2026-08-05', sampleFinal)

    expect(loadFinalDirectives('2026-08-05')).toEqual(sampleDirectives)
  })
})

describe('computeDecisionHash', () => {
  test('is stable under array reorder and changes when answers or policy change', () => {
    const base = computeDecisionHash({
      directives: sampleDirectives,
      grillAnswerIds: ['a-2', 'a-1'],
      mergePolicyContents: '{"forkFirst":["a"]}',
    })
    const reordered = computeDecisionHash({
      directives: {
        ...sampleDirectives,
        delete: [...sampleDirectives.delete].reverse(),
        mustEdit: [...sampleDirectives.mustEdit].reverse(),
      },
      grillAnswerIds: ['a-1', 'a-2'],
      mergePolicyContents: '{"forkFirst":["a"]}',
    })
    expect(reordered).toBe(base)

    const newAnswers = computeDecisionHash({
      directives: sampleDirectives,
      grillAnswerIds: ['a-1', 'a-2', 'a-3'],
      mergePolicyContents: '{"forkFirst":["a"]}',
    })
    expect(newAnswers).not.toBe(base)

    const newPolicy = computeDecisionHash({
      directives: sampleDirectives,
      grillAnswerIds: ['a-2', 'a-1'],
      mergePolicyContents: '{"forkFirst":["b"]}',
    })
    expect(newPolicy).not.toBe(base)

    const newDirectives = computeDecisionHash({
      directives: emptyMergeDirectives(),
      grillAnswerIds: ['a-2', 'a-1'],
      mergePolicyContents: '{"forkFirst":["a"]}',
    })
    expect(newDirectives).not.toBe(base)
  })
})

describe('collectGrillAnswerIds', () => {
  test('keeps only entries with non-empty answers', () => {
    expect(
      collectGrillAnswerIds([
        { id: 'q1', answer: 'drop voice' },
        { id: 'q2', answer: '   ' },
        { id: 'q3' },
        { id: 'q4', answer: 'keep migrations' },
      ])
    ).toEqual(['q1', 'q4'])
  })
})

describe('formatParentPlanSummary', () => {
  test('renders self-resolutions and child areas from a draft', () => {
    const summary = formatParentPlanSummary(sampleDraft)
    expect(summary).toContain('### Self-resolutions')
    expect(summary).toContain('Keep fork arena tools')
    expect(summary).toContain('### Child areas')
    expect(summary).toContain('**billing**')
    expect(summary).toContain('area-level (files assigned after merge)')
  })
})

describe('clustersFromMergePlan vs fallback grouping', () => {
  const unmerged = ['apps/sim/lib/chat/index.ts', 'leftover.ts', 'apps/sim/lib/billing/usage.ts']

  test('returns null when the final plan is missing or has empty clusters', () => {
    expect(clustersFromMergePlan(null, unmerged)).toBeNull()
    expect(clustersFromMergePlan({ childClusters: [] }, unmerged)).toBeNull()
  })

  test('spawns one leaf per planned cluster using still-unmerged assigned files', () => {
    const roots = clustersFromMergePlan(sampleFinal, ['apps/sim/lib/chat/index.ts', 'leftover.ts'])
    expect(roots).not.toBeNull()
    const leaves = leafConflictClusters(roots ?? [])
    expect(leaves.map((leaf) => leaf.id)).toEqual(['chat-voice', 'unplanned'])
    expect(leaves[0]?.files).toEqual(['apps/sim/lib/chat/index.ts'])
    expect(leaves[0]?.strategy).toBe('mustEdit')
    expect(leaves[1]?.files).toEqual(['leftover.ts'])
  })

  test('appends unassigned leftovers onto unplanned', () => {
    const roots = clustersFromMergePlan(sampleFinal, unmerged)
    const unplanned = roots?.find((cluster) => cluster.id === 'unplanned')
    expect(unplanned?.files).toEqual(['leftover.ts', 'apps/sim/lib/billing/usage.ts'])
  })

  test('returns an empty forest when planned files are already resolved', () => {
    const roots = clustersFromMergePlan(sampleFinal, [])
    expect(roots).toEqual([])
  })

  test('fallback prefix clustering is used only when the helper returns null', () => {
    const planned = clustersFromMergePlan(sampleFinal, unmerged)
    const fallback = groupConflictClusters(unmerged, {
      minPrefixSegments: 4,
      maxFilesPerCluster: 12,
      maxDepth: 5,
    })
    expect(planned).not.toBeNull()
    expect(leafConflictClusters(planned ?? []).map((leaf) => leaf.id)).not.toEqual(
      leafConflictClusters(fallback).map((leaf) => leaf.id)
    )

    const missingPlanClusters =
      clustersFromMergePlan(null, unmerged) ?? groupConflictClusters(unmerged)
    expect(leafConflictClusters(missingPlanClusters).length).toBeGreaterThan(0)
    expect(missingPlanClusters.every((root) => root.id.startsWith('cluster-'))).toBe(true)
  })
})

describe('resolveDirectivesForDecisionHash', () => {
  test('prefers final directives over draft proposed maps', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'merge-plan-hash-'))
    process.chdir(tempDir)
    writeMergePlanDraft('2026-08-05', sampleDraft)
    writeMergePlanFinal('2026-08-05', sampleFinal)
    expect(resolveDirectivesForDecisionHash('2026-08-05')).toEqual(sampleDirectives)
  })

  test('uses a single draft proposed map before finalize', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'merge-plan-draft-hash-'))
    process.chdir(tempDir)
    writeMergePlanDraft('2026-08-05', {
      ...sampleDraft,
      proposedDirectives: { 'Q2-B': sampleDirectives },
    })
    expect(resolveDirectivesForDecisionHash('2026-08-05')).toEqual(sampleDirectives)
  })

  test('returns empty directives when multiple proposed maps are still unresolved', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'merge-plan-multi-hash-'))
    process.chdir(tempDir)
    writeMergePlanDraft('2026-08-05', sampleDraft)
    expect(resolveDirectivesForDecisionHash('2026-08-05')).toEqual(emptyMergeDirectives())
  })
})

describe('restrictMergeDirectivesToUnmerged', () => {
  test('keeps only still-unmerged directive targets', () => {
    const { directives, dropped } = restrictMergeDirectivesToUnmerged(
      {
        delete: ['gone.ts', 'already-gone.ts'],
        checkoutTheirs: ['theirs.ts', 'resolved-theirs.ts'],
        checkoutOurs: ['ours.ts'],
        mustEdit: ['edit-me.ts', 'resolved-edit.ts'],
        overrideForkFirst: ['override.ts'],
        notes: 'locked from Q2-B',
      },
      ['gone.ts', 'theirs.ts', 'ours.ts', 'edit-me.ts']
    )

    expect(directives).toEqual({
      delete: ['gone.ts'],
      checkoutTheirs: ['theirs.ts'],
      checkoutOurs: ['ours.ts'],
      mustEdit: ['edit-me.ts'],
      overrideForkFirst: [],
      notes: 'locked from Q2-B',
    })
    expect(dropped).toEqual([
      'already-gone.ts',
      'override.ts',
      'resolved-edit.ts',
      'resolved-theirs.ts',
    ])
  })
})

describe('applyMergeDirectives', () => {
  test('checkouts ours/theirs and deletes resolved paths during a merge', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'merge-directives-'))
    const repo = tempDir
    git(repo, ['init', '-b', 'main'])
    git(repo, ['config', 'user.email', 'test@example.com'])
    git(repo, ['config', 'user.name', 'Test'])
    git(repo, ['config', 'commit.gpgsign', 'false'])

    writeFileSync(join(repo, 'ours.ts'), 'ours-base\n')
    writeFileSync(join(repo, 'theirs.ts'), 'theirs-base\n')
    writeFileSync(join(repo, 'gone.ts'), 'delete-me\n')
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'base'])

    git(repo, ['checkout', '-b', 'upstream'])
    writeFileSync(join(repo, 'ours.ts'), 'theirs-ours.ts\n')
    writeFileSync(join(repo, 'theirs.ts'), 'theirs-theirs.ts\n')
    writeFileSync(join(repo, 'gone.ts'), 'theirs-gone.ts\n')
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'upstream'])

    git(repo, ['checkout', 'main'])
    writeFileSync(join(repo, 'ours.ts'), 'fork-ours.ts\n')
    writeFileSync(join(repo, 'theirs.ts'), 'fork-theirs.ts\n')
    writeFileSync(join(repo, 'gone.ts'), 'fork-gone.ts\n')
    git(repo, ['add', '.'])
    git(repo, ['commit', '-m', 'fork'])

    try {
      git(repo, ['merge', 'upstream'])
    } catch {
      // expected conflicts
    }

    process.chdir(repo)
    const result = applyMergeDirectives({
      delete: ['gone.ts'],
      checkoutTheirs: ['theirs.ts'],
      checkoutOurs: ['ours.ts'],
      mustEdit: [],
      overrideForkFirst: [],
      notes: '',
    })

    expect(result.failed).toEqual([])
    expect(result.checkoutOurs).toEqual(['ours.ts'])
    expect(result.checkoutTheirs).toEqual(['theirs.ts'])
    expect(result.deleted).toEqual(['gone.ts'])
    expect(
      execFileSync('git', ['diff', '--name-only', '--diff-filter=U'], {
        cwd: repo,
        encoding: 'utf8',
      }).trim()
    ).toBe('')
  }, 20_000)
})

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
  }).trim()
}

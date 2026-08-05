/**
 * Run with: bun test .sandcastle/lib/cluster-report.test.ts
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'bun:test'
import {
  formatClusterReportTable,
  listClusterReports,
  parseClusterReport,
  readClusterReport,
  validateClusterReport,
  writeClusterReport,
} from './cluster-report'

const originalCwd = process.cwd()
let tempDir = ''

afterEach(() => {
  process.chdir(originalCwd)
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = ''
  }
})

const sample = {
  clusterId: 'cluster-1.2',
  runId: '2026-08-05',
  files: [
    {
      path: 'apps/sim/lib/chat/index.ts',
      resolution: 'manual' as const,
      notes: 'Kept fork voice hooks',
    },
    { path: 'apps/sim/lib/voice/tts.ts', resolution: 'deleted' as const },
    { path: 'apps/sim/tools/arena/foo.ts', resolution: 'ours' as const },
    { path: 'apps/sim/providers/models.ts', resolution: 'theirs' as const },
  ],
  policyProposals: [
    {
      kind: 'unionPaths' as const,
      prefix: 'apps/sim/providers/models.ts',
      notes: 'Keep fork models + upstream additions',
    },
  ],
  notes: 'Voice drop + arena keep',
}

describe('cluster report schema', () => {
  test('accepts ours/theirs/manual/deleted plus optional policy proposals', () => {
    expect(validateClusterReport(sample)).toEqual({ ok: true, report: sample })
  })

  test('rejects unknown resolutions and duplicate paths', () => {
    expect(
      validateClusterReport({
        ...sample,
        files: [{ path: 'a.ts', resolution: 'fork' }],
      }).ok
    ).toBe(false)
    expect(
      validateClusterReport({
        ...sample,
        files: [
          { path: 'a.ts', resolution: 'ours' },
          { path: 'a.ts', resolution: 'theirs' },
        ],
      }).ok
    ).toBe(false)
  })

  test('parseClusterReport throws on invalid input', () => {
    expect(() => parseClusterReport({})).toThrow(/Invalid cluster report/)
  })

  test('round-trips ledger JSON', () => {
    tempDir = mkdtempSync(join(tmpdir(), 'cluster-report-'))
    process.chdir(tempDir)
    writeClusterReport('2026-08-05', sample)
    expect(readClusterReport('2026-08-05', 'cluster-1.2')).toEqual(sample)
    expect(listClusterReports('2026-08-05')).toEqual([sample])
    const table = formatClusterReportTable(sample)
    expect(table).toContain('| `apps/sim/lib/voice/tts.ts` | deleted |')
    expect(table).toContain('`unionPaths` `apps/sim/providers/models.ts`')
  })
})

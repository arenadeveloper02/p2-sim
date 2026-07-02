/**
 * Run with: bun test .sandcastle/lib/config-run-log.test.ts
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, test } from 'bun:test'

const originalCwd = process.cwd()
let tempDir = ''

afterEach(() => {
  process.chdir(originalCwd)
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = ''
  }
})

describe('appendRunLogSections', () => {
  test('merges sections without dropping prior content', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'upstream-sync-log-'))
    mkdirSync(join(tempDir, '.upstream-sync/ledger/2026-07-01'), { recursive: true })
    process.chdir(tempDir)

    const { appendRunLogSections } = await import('./config')

    appendRunLogSections('2026-07-01', {
      'Sync topology': '- commits: 123',
    })
    appendRunLogSections('2026-07-01', {
      Usage: '- input: 100',
    })

    const content = readFileSync('.upstream-sync/ledger/2026-07-01/run.md', 'utf8')
    expect(content).toContain('## Sync topology')
    expect(content).toContain('commits: 123')
    expect(content).toContain('## Usage')
    expect(content).toContain('input: 100')
  })
})

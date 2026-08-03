/**
 * Run with: bun test .sandcastle/lib/grill-state.test.ts
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

describe('hasUnansweredGrillQuestions', () => {
  test('returns false when open-questions file is missing', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'upstream-sync-grill-'))
    mkdirSync(join(tempDir, '.upstream-sync/ledger/2026-08-03'), { recursive: true })
    process.chdir(tempDir)

    const { hasUnansweredGrillQuestions } = await import('./grill-state')
    expect(hasUnansweredGrillQuestions({ runId: '2026-08-03' })).toBe(false)
  })

  test('returns false for explicit no-open-questions content', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'upstream-sync-grill-'))
    const dir = join(tempDir, '.upstream-sync/ledger/2026-08-03')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'open-questions.md'),
      '# No open questions\n\nAll decisions resolved from merge-policy / ledger.\n'
    )
    process.chdir(tempDir)

    const { hasUnansweredGrillQuestions } = await import('./grill-state')
    expect(hasUnansweredGrillQuestions({ runId: '2026-08-03' })).toBe(false)
  })

  test('returns true when question marker content is present', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'upstream-sync-grill-'))
    const dir = join(tempDir, '.upstream-sync/ledger/2026-08-03')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'open-questions.md'),
      '<!-- upstream-sync-question -->\n## Questions\n\n1. Adopt desktop app?\n'
    )
    process.chdir(tempDir)

    const { hasUnansweredGrillQuestions } = await import('./grill-state')
    expect(hasUnansweredGrillQuestions({ runId: '2026-08-03' })).toBe(true)
  })

  test('clearOpenQuestionsFile makes the gate pass', async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'upstream-sync-grill-'))
    const dir = join(tempDir, '.upstream-sync/ledger/2026-08-03')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'open-questions.md'),
      '<!-- upstream-sync-question -->\n1. Something?\n'
    )
    process.chdir(tempDir)

    const { clearOpenQuestionsFile, hasUnansweredGrillQuestions } = await import('./grill-state')
    expect(hasUnansweredGrillQuestions({ runId: '2026-08-03' })).toBe(true)
    clearOpenQuestionsFile('2026-08-03')
    expect(hasUnansweredGrillQuestions({ runId: '2026-08-03' })).toBe(false)
  })
})

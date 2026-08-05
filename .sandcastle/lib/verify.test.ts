/**
 * Run with: bun test .sandcastle/lib/verify.test.ts
 */
import { describe, expect, test } from 'bun:test'
import {
  allBlockingVerificationPassed,
  allVerificationPassed,
  formatBuildLogForFixAgent,
  formatVerifyResults,
  formatVerifyStatusLine,
  type VerifyResult,
} from './verify'

const mixed: VerifyResult[] = [
  { command: 'bun run check', success: true, output: 'ok', blocking: false },
  { command: 'bun run test', success: false, output: 'FAIL suite', blocking: false },
]

const buildFailed: VerifyResult[] = [
  { command: 'bun run check', success: true, output: 'ok', blocking: false },
  { command: 'bun run lint', success: true, output: 'ok', blocking: false },
  { command: 'bun run test', success: false, output: 'FAIL suite', blocking: false },
  {
    command: 'bun run build',
    success: false,
    output: "Module not found: '@/missing'",
    blocking: true,
  },
]

const buildPassedAdvisoryFailed: VerifyResult[] = [
  { command: 'bun run check', success: true, output: 'ok', blocking: false },
  { command: 'bun run lint', success: false, output: 'lint noise', blocking: false },
  { command: 'bun run test', success: true, output: 'ok', blocking: false },
  { command: 'bun run build', success: true, output: 'compiled', blocking: true },
]

describe('advisory verification formatting', () => {
  test('status line shows per-command pass/fail', () => {
    expect(formatVerifyStatusLine(mixed)).toBe('✅ `bun run check` · ⚠️ `bun run test`')
  })

  test('results markdown marks lint/test failures as advisory', () => {
    const markdown = formatVerifyResults(mixed)
    expect(markdown).toContain('Advisory verification failed')
    expect(markdown).toContain('❌ failed (advisory)')
    expect(markdown).toContain('✅ passed')
    expect(markdown).toContain('FAIL suite')
    expect(markdown).not.toContain('Blocking verification failed')
  })

  test('allVerificationPassed requires every command', () => {
    expect(allVerificationPassed(mixed)).toBe(false)
    expect(
      allVerificationPassed([
        { command: 'bun run check', success: true, output: '', blocking: false },
        { command: 'bun run lint', success: true, output: '', blocking: false },
        { command: 'bun run test', success: true, output: '', blocking: false },
        { command: 'bun run build', success: true, output: '', blocking: true },
      ])
    ).toBe(true)
  })
})

describe('blocking verification', () => {
  test('build failure is not allBlockingVerificationPassed', () => {
    expect(allBlockingVerificationPassed(buildFailed)).toBe(false)
    expect(allBlockingVerificationPassed(buildFailed, { requireCheck: true })).toBe(false)
  })

  test('advisory failures still allow blocking pass when build succeeded', () => {
    expect(allBlockingVerificationPassed(buildPassedAdvisoryFailed)).toBe(true)
    expect(allVerificationPassed(buildPassedAdvisoryFailed)).toBe(false)
  })

  test('requireCheck can tighten the blocking gate', () => {
    const checkFailed = [
      { command: 'bun run check', success: false, output: 'type error', blocking: false },
      { command: 'bun run build', success: true, output: 'ok', blocking: true },
    ] satisfies VerifyResult[]
    expect(allBlockingVerificationPassed(checkFailed)).toBe(true)
    expect(allBlockingVerificationPassed(checkFailed, { requireCheck: true })).toBe(false)
  })

  test('missing build result fails the blocking gate', () => {
    expect(allBlockingVerificationPassed(mixed)).toBe(false)
  })

  test('formatVerifyResults calls out blocking build failures', () => {
    const markdown = formatVerifyResults(buildFailed)
    expect(markdown).toContain('Blocking verification failed')
    expect(markdown).toContain('❌ failed (blocking)')
    expect(markdown).not.toContain('failures do not block the sync')
  })

  test('formatBuildLogForFixAgent returns the build tail', () => {
    expect(formatBuildLogForFixAgent(buildFailed[3])).toContain('Module not found')
    expect(formatBuildLogForFixAgent(undefined)).toContain('No build verification result')
  })
})

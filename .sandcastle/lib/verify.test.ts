/**
 * Run with: bun test ./.sandcastle/lib/verify.test.ts
 */
import { describe, expect, test } from 'bun:test'
import {
  allBlockingVerificationPassed,
  allVerificationPassed,
  formatBuildLogForFixAgent,
  formatVerifyResults,
  formatVerifyStatusLine,
  runShellCommandStreaming,
  type VerifyResult,
} from './verify'

const mixed: VerifyResult[] = [
  { command: 'bun run check', success: true, output: 'ok', blocking: false },
  { command: 'bun run test', success: false, output: 'FAIL suite', blocking: false },
]

const advisoryOnly: VerifyResult[] = [
  { command: 'bun run check', success: true, output: 'ok', blocking: false },
  { command: 'bun run lint', success: true, output: 'ok', blocking: false },
  { command: 'bun run test', success: false, output: 'FAIL suite', blocking: false },
]

const advisoryPassed: VerifyResult[] = [
  { command: 'bun run check', success: true, output: 'ok', blocking: false },
  { command: 'bun run lint', success: true, output: 'ok', blocking: false },
  { command: 'bun run test', success: true, output: 'ok', blocking: false },
]

const legacyBuildFailed: VerifyResult[] = [
  ...advisoryPassed,
  {
    command: 'bun run build',
    success: false,
    output: "Module not found: '@/missing'",
    blocking: true,
  },
]

describe('runShellCommandStreaming', () => {
  test('captures stdout and success', () => {
    const result = runShellCommandStreaming('printf hello', { heartbeatMs: 60_000 })
    expect(result.success).toBe(true)
    expect(result.output).toContain('hello')
  })

  test('captures non-zero exit', () => {
    const result = runShellCommandStreaming('printf fail-out; exit 7', { heartbeatMs: 60_000 })
    expect(result.success).toBe(false)
    expect(result.output).toContain('fail-out')
  })
})

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
    expect(markdown).toContain('left to CI')
    expect(markdown).not.toContain('Blocking verification failed')
  })

  test('allVerificationPassed requires every default harness command', () => {
    expect(allVerificationPassed(mixed)).toBe(false)
    expect(allVerificationPassed(advisoryPassed)).toBe(true)
  })
})

describe('blocking verification', () => {
  test('harness completes without a build result (CI owns build)', () => {
    expect(allBlockingVerificationPassed(mixed)).toBe(true)
    expect(allBlockingVerificationPassed(advisoryOnly)).toBe(true)
    expect(allBlockingVerificationPassed(advisoryPassed)).toBe(true)
  })

  test('explicit blocking failure in results still fails the gate', () => {
    expect(allBlockingVerificationPassed(legacyBuildFailed)).toBe(false)
  })

  test('requireCheck can tighten the blocking gate', () => {
    const checkFailed = [
      { command: 'bun run check', success: false, output: 'type error', blocking: false },
    ] satisfies VerifyResult[]
    expect(allBlockingVerificationPassed(checkFailed)).toBe(true)
    expect(allBlockingVerificationPassed(checkFailed, { requireCheck: true })).toBe(false)
  })

  test('formatVerifyResults calls out blocking failures when present', () => {
    const markdown = formatVerifyResults(legacyBuildFailed)
    expect(markdown).toContain('Blocking verification failed')
    expect(markdown).toContain('❌ failed (blocking)')
  })

  test('formatBuildLogForFixAgent returns the build tail', () => {
    expect(formatBuildLogForFixAgent(legacyBuildFailed[3])).toContain('Module not found')
    expect(formatBuildLogForFixAgent(undefined)).toContain('No build verification result')
  })
})

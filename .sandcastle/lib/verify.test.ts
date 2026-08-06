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
  { command: 'bun run lint', success: false, output: 'lint fail', blocking: false },
]

const advisoryOnly: VerifyResult[] = [
  { command: 'bun run check', success: true, output: 'ok', blocking: false },
  { command: 'bun run lint', success: false, output: 'lint fail', blocking: false },
]

const advisoryPassed: VerifyResult[] = [
  { command: 'bun run check', success: true, output: 'ok', blocking: false },
  { command: 'bun run lint', success: true, output: 'ok', blocking: false },
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
    expect(formatVerifyStatusLine(mixed)).toBe('✅ `bun run check` · ⚠️ `bun run lint`')
  })

  test('results markdown marks lint failures as advisory', () => {
    const markdown = formatVerifyResults(mixed)
    expect(markdown).toContain('Advisory verification failed')
    expect(markdown).toContain('❌ failed (advisory)')
    expect(markdown).toContain('✅ passed')
    expect(markdown).toContain('lint fail')
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

  test('legacy build failures still count as blocking when present', () => {
    expect(allBlockingVerificationPassed(legacyBuildFailed)).toBe(false)
  })

  test('formatBuildLogForFixAgent includes failed build output', () => {
    const build = legacyBuildFailed.find((r) => r.command === 'bun run build')
    const log = formatBuildLogForFixAgent(build)
    expect(log).toContain('@/missing')
  })
})

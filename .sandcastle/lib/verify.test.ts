/**
 * Run with: bun test .sandcastle/lib/verify.test.ts
 */
import { describe, expect, test } from 'bun:test'
import {
  allVerificationPassed,
  formatVerifyResults,
  formatVerifyStatusLine,
  type VerifyResult,
} from './verify'

const mixed: VerifyResult[] = [
  { command: 'bun run check', success: true, output: 'ok' },
  { command: 'bun run test', success: false, output: 'FAIL suite' },
]

describe('advisory verification formatting', () => {
  test('status line shows per-command pass/fail', () => {
    expect(formatVerifyStatusLine(mixed)).toBe(
      '✅ `bun run check` · ❌ `bun run test`'
    )
  })

  test('results markdown marks failures as advisory', () => {
    const markdown = formatVerifyResults(mixed)
    expect(markdown).toContain('advisory')
    expect(markdown).toContain('❌ failed')
    expect(markdown).toContain('✅ passed')
    expect(markdown).toContain('FAIL suite')
  })

  test('allVerificationPassed requires every command', () => {
    expect(allVerificationPassed(mixed)).toBe(false)
    expect(
      allVerificationPassed([
        { command: 'bun run check', success: true, output: '' },
        { command: 'bun run lint', success: true, output: '' },
        { command: 'bun run test', success: true, output: '' },
        { command: 'bun run build', success: true, output: '' },
      ])
    ).toBe(true)
  })
})

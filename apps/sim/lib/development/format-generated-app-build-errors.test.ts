/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  extractBuildErrorLines,
  formatBuildErrorsSummary,
} from '@/lib/development/format-generated-app-build-errors'

describe('format-generated-app-build-errors', () => {
  it('extracts TypeScript error lines from tsc output', () => {
    const output = [
      '=== tsc --noEmit ===',
      'lib/actions.ts(12,5): error TS2322: Type string is not assignable to type number.',
      'components/Foo.tsx(3,1): error TS2305: Module has no exported member Bar.',
    ].join('\n')

    expect(extractBuildErrorLines(output)).toEqual([
      'lib/actions.ts(12,5): error TS2322: Type string is not assignable to type number.',
      'components/Foo.tsx(3,1): error TS2305: Module has no exported member Bar.',
    ])
  })

  it('extracts Next.js compile errors from build output', () => {
    const output = [
      'Failed to compile.',
      './app/page.tsx',
      'Type error: Property "data" is missing in type {}.',
    ].join('\n')

    expect(extractBuildErrorLines(output)).toEqual([
      'Failed to compile.',
      'Type error: Property "data" is missing in type {}.',
    ])
  })

  it('prefers structure issues in formatBuildErrorsSummary', () => {
    const summary = formatBuildErrorsSummary('ignored output', [
      'Missing file for import @/components/Footer',
    ])

    expect(summary).toBe('Missing file for import @/components/Footer')
  })
})

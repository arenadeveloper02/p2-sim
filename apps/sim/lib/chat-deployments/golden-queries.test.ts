/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { sanitizeGoldenQueryStrings } from '@/lib/chat-deployments/golden-queries'

describe('sanitizeGoldenQueryStrings', () => {
  it('returns an empty list when the field is omitted', () => {
    expect(sanitizeGoldenQueryStrings()).toEqual([])
    expect(sanitizeGoldenQueryStrings(undefined)).toEqual([])
  })

  it('trims entries and drops blanks', () => {
    expect(sanitizeGoldenQueryStrings(['  hello  ', '', '  ', 'world'])).toEqual(['hello', 'world'])
  })
})

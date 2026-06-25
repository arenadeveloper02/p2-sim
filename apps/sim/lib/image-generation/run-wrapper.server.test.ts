/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { resolveVariationsCount } from '@/lib/image-generation/run-wrapper.server'

describe('resolveVariationsCount', () => {
  it('defaults to 1 when variations and imageCount are omitted', () => {
    expect(resolveVariationsCount({ prompt: 'A cat' })).toBe(1)
  })

  it('uses variations when provided', () => {
    expect(resolveVariationsCount({ variations: 3 })).toBe(3)
  })

  it('falls back to imageCount when variations is omitted', () => {
    expect(resolveVariationsCount({ imageCount: 4 })).toBe(4)
  })

  it('prefers variations over imageCount', () => {
    expect(resolveVariationsCount({ variations: 2, imageCount: 5 })).toBe(2)
  })

  it('clamps values below 1 to 1', () => {
    expect(resolveVariationsCount({ variations: 0 })).toBe(1)
    expect(resolveVariationsCount({ variations: -3 })).toBe(1)
  })

  it('clamps values above 5 to 5', () => {
    expect(resolveVariationsCount({ variations: 10 })).toBe(5)
  })

  it('rounds fractional values', () => {
    expect(resolveVariationsCount({ variations: 2.6 })).toBe(3)
  })

  it('returns 1 for non-numeric values', () => {
    expect(resolveVariationsCount({ variations: 'abc' })).toBe(1)
  })
})

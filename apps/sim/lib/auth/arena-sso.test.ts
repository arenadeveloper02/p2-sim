import { describe, expect, it } from 'vitest'
import { sanitizeReturnPath } from '@/lib/auth/arena-sso-path'

describe('sanitizeReturnPath', () => {
  it('allows relative workspace paths', () => {
    expect(sanitizeReturnPath('/workspace')).toBe('/workspace')
    expect(sanitizeReturnPath('/workspace/abc?x=1')).toBe('/workspace/abc?x=1')
  })

  it('rejects absolute and scheme-relative URLs', () => {
    expect(sanitizeReturnPath('https://evil.example/phish')).toBe('/workspace')
    expect(sanitizeReturnPath('//evil.example/phish')).toBe('/workspace')
    expect(sanitizeReturnPath('workspace')).toBe('/workspace')
  })

  it('defaults empty values', () => {
    expect(sanitizeReturnPath(null)).toBe('/workspace')
    expect(sanitizeReturnPath('')).toBe('/workspace')
  })
})

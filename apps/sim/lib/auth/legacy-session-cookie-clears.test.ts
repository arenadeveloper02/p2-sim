/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildComprehensiveSessionCookieClearHeaderValues,
  buildComprehensiveSessionCookieClearHeaderValuesForHostnames,
  collectSessionCookieDomainsToClear,
  createSessionCookieClearResponse,
  domainAttributeVariants,
  getParentDomainFromPublicHostname,
} from '@/lib/auth/legacy-session-cookie-clears'

describe('domainAttributeVariants', () => {
  it('emits both dotted and undotted Domain forms', () => {
    expect(domainAttributeVariants('thearena.ai')).toEqual(['thearena.ai', '.thearena.ai'])
    expect(domainAttributeVariants('.thearena.ai')).toEqual(['thearena.ai', '.thearena.ai'])
  })
})

describe('getParentDomainFromPublicHostname', () => {
  it('returns the registrable parent for agent hosts', () => {
    expect(getParentDomainFromPublicHostname('test-agent.thearena.ai')).toBe('thearena.ai')
  })

  it('returns undefined for two-label hosts', () => {
    expect(getParentDomainFromPublicHostname('thearena.ai')).toBeUndefined()
  })
})

describe('collectSessionCookieDomainsToClear', () => {
  it('includes host, parent, and leading-dot variants', () => {
    expect(collectSessionCookieDomainsToClear(['test-agent.thearena.ai'])).toEqual([
      'test-agent.thearena.ai',
      '.test-agent.thearena.ai',
      'thearena.ai',
      '.thearena.ai',
    ])
  })
})

describe('buildComprehensiveSessionCookieClearHeaderValues', () => {
  it('expires the leftover parent-domain session_token Chrome stores as .thearena.ai', () => {
    const lines = buildComprehensiveSessionCookieClearHeaderValues('test-agent.thearena.ai', true)

    const tokenClears = lines.filter((line) =>
      line.startsWith('__Secure-better-auth.session_token=')
    )

    expect(tokenClears.some((line) => line.includes('Domain=.thearena.ai'))).toBe(true)
    expect(tokenClears.some((line) => /Domain=thearena\.ai;/.test(line))).toBe(true)
    expect(tokenClears.some((line) => !line.includes('Domain='))).toBe(true)
    expect(tokenClears.every((line) => line.includes('Max-Age=0'))).toBe(true)
    expect(
      tokenClears.every((line) => line.includes('Expires=Thu, 01 Jan 1970 00:00:00 GMT'))
    ).toBe(true)
    expect(tokenClears.every((line) => line.includes('Secure'))).toBe(true)
  })
})

describe('buildComprehensiveSessionCookieClearHeaderValuesForHostnames', () => {
  it('still emits host-only clears when no public hostnames are known', () => {
    const lines = buildComprehensiveSessionCookieClearHeaderValuesForHostnames([], true)
    expect(lines.some((line) => line.startsWith('__Secure-better-auth.session_token='))).toBe(true)
    expect(lines.every((line) => !line.includes('Domain='))).toBe(true)
  })
})

describe('createSessionCookieClearResponse', () => {
  it('keeps same-name Set-Cookie headers with different Domain attributes', async () => {
    const lines = buildComprehensiveSessionCookieClearHeaderValues('test-agent.thearena.ai', true)
    const response = createSessionCookieClearResponse({ ok: true }, lines)
    const setCookies = response.headers.getSetCookie()

    expect(setCookies).toEqual(lines)
    expect(
      setCookies.filter((line) => line.startsWith('__Secure-better-auth.session_token=')).length
    ).toBeGreaterThan(1)

    const body = await response.json()
    expect(body).toEqual({ ok: true })
  })
})

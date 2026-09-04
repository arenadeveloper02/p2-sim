/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildAdsQueryCacheKey,
  getCachedAdsQuery,
  setCachedAdsQuery,
} from '@/lib/ads-query-cache.server'

const mockGet = vi.fn()
const mockSet = vi.fn()
let mockClient: { get: typeof mockGet; set: typeof mockSet } | null = {
  get: mockGet,
  set: mockSet,
}

vi.mock('@/lib/core/config/redis', () => ({
  getRedisClient: () => mockClient,
}))

const parts = {
  workspaceId: 'ws-1',
  accountKey: 'gentle_dental',
  question: 'How did campaigns perform last week?',
}

beforeEach(() => {
  vi.clearAllMocks()
  mockClient = { get: mockGet, set: mockSet }
})

describe('buildAdsQueryCacheKey', () => {
  it('is deterministic for identical inputs', () => {
    expect(buildAdsQueryCacheKey('google', parts)).toBe(buildAdsQueryCacheKey('google', parts))
  })

  it('normalizes case and whitespace in the question', () => {
    const shouted = { ...parts, question: '  HOW did   campaigns PERFORM last week?  ' }
    expect(buildAdsQueryCacheKey('google', shouted)).toBe(buildAdsQueryCacheKey('google', parts))
  })

  it('changes when question, account, workspace, channel, or extras change', () => {
    const base = buildAdsQueryCacheKey('google', parts)
    expect(buildAdsQueryCacheKey('google', { ...parts, question: 'spend by device' })).not.toBe(
      base
    )
    expect(buildAdsQueryCacheKey('google', { ...parts, accountKey: 'other_account' })).not.toBe(
      base
    )
    expect(buildAdsQueryCacheKey('google', { ...parts, workspaceId: 'ws-2' })).not.toBe(base)
    expect(buildAdsQueryCacheKey('bing', parts)).not.toBe(base)
    expect(
      buildAdsQueryCacheKey('google', { ...parts, extra: { date_preset: 'last_7d' } })
    ).not.toBe(base)
  })
})

describe('getCachedAdsQuery', () => {
  it('returns the parsed cached response on a hit', async () => {
    mockGet.mockResolvedValueOnce(JSON.stringify({ success: true, rows: [1, 2] }))
    await expect(getCachedAdsQuery('bing', parts)).resolves.toEqual({
      success: true,
      rows: [1, 2],
    })
    expect(mockGet).toHaveBeenCalledWith(buildAdsQueryCacheKey('bing', parts))
  })

  it('returns null on a miss', async () => {
    mockGet.mockResolvedValueOnce(null)
    await expect(getCachedAdsQuery('google', parts)).resolves.toBeNull()
  })

  it('returns null when Redis is not configured', async () => {
    mockClient = null
    await expect(getCachedAdsQuery('google', parts)).resolves.toBeNull()
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('returns null instead of throwing when Redis errors', async () => {
    mockGet.mockRejectedValueOnce(new Error('connection lost'))
    await expect(getCachedAdsQuery('google', parts)).resolves.toBeNull()
  })

  it('returns null instead of throwing on corrupt cached JSON', async () => {
    mockGet.mockResolvedValueOnce('{not json')
    await expect(getCachedAdsQuery('google', parts)).resolves.toBeNull()
  })
})

describe('setCachedAdsQuery', () => {
  it('stores the serialized response with a TTL', async () => {
    await setCachedAdsQuery('facebook', parts, { success: true })
    expect(mockSet).toHaveBeenCalledWith(
      buildAdsQueryCacheKey('facebook', parts),
      JSON.stringify({ success: true }),
      'EX',
      600
    )
  })

  it('no-ops when Redis is not configured', async () => {
    mockClient = null
    await expect(setCachedAdsQuery('google', parts, { a: 1 })).resolves.toBeUndefined()
    expect(mockSet).not.toHaveBeenCalled()
  })

  it('swallows Redis write errors', async () => {
    mockSet.mockRejectedValueOnce(new Error('read-only replica'))
    await expect(setCachedAdsQuery('google', parts, { a: 1 })).resolves.toBeUndefined()
  })
})

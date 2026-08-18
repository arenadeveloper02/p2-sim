/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckRateLimitDirect, mockGetClientIp } = vi.hoisted(() => ({
  mockCheckRateLimitDirect: vi.fn(),
  mockGetClientIp: vi.fn(),
}))

vi.mock('@/lib/core/rate-limiter', () => ({
  RateLimiter: class {
    checkRateLimitDirect = mockCheckRateLimitDirect
  },
}))

vi.mock('@/lib/core/utils/request', () => ({
  getClientIp: mockGetClientIp,
}))

import {
  checkGenerativeAppActionRateLimit,
  GENERATIVE_APP_ACTION_IP_RATE_LIMIT,
  GENERATIVE_APP_ACTION_RATE_LIMIT_MESSAGE,
} from '@/lib/arena-generative-ui/rate-limit'

const request = {} as Parameters<typeof checkGenerativeAppActionRateLimit>[1]

describe('checkGenerativeAppActionRateLimit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetClientIp.mockReturnValue('203.0.113.5')
  })

  it('returns null while the bucket has tokens', async () => {
    mockCheckRateLimitDirect.mockResolvedValue({ allowed: true, remaining: 119 })

    expect(await checkGenerativeAppActionRateLimit('lead-score', request)).toBeNull()
  })

  it('keys the bucket by app and IP so one app cannot drain another', async () => {
    mockCheckRateLimitDirect.mockResolvedValue({ allowed: true, remaining: 1 })

    await checkGenerativeAppActionRateLimit('lead-score', request)

    expect(mockCheckRateLimitDirect).toHaveBeenCalledWith(
      'gui-app-action:ip:lead-score:203.0.113.5',
      GENERATIVE_APP_ACTION_IP_RATE_LIMIT
    )
  })

  it('returns 429 with Retry-After once the bucket is empty', async () => {
    mockCheckRateLimitDirect.mockResolvedValue({ allowed: false, retryAfterMs: 42_000 })

    const response = await checkGenerativeAppActionRateLimit('lead-score', request)

    expect(response?.status).toBe(429)
    expect(response?.headers.get('Retry-After')).toBe('42')
    await expect(response?.json()).resolves.toMatchObject({
      error: GENERATIVE_APP_ACTION_RATE_LIMIT_MESSAGE,
    })
  })

  it('falls back to the refill window when the limiter reports no retry hint', async () => {
    mockCheckRateLimitDirect.mockResolvedValue({ allowed: false })

    const response = await checkGenerativeAppActionRateLimit('lead-score', request)

    expect(response?.headers.get('Retry-After')).toBe('300')
  })

  it('rounds a partial second up so Retry-After is never 0', async () => {
    mockCheckRateLimitDirect.mockResolvedValue({ allowed: false, retryAfterMs: 250 })

    const response = await checkGenerativeAppActionRateLimit('lead-score', request)

    expect(response?.headers.get('Retry-After')).toBe('1')
  })

  it('budgets enough headroom for ordinary use of a multi-action page', () => {
    expect(GENERATIVE_APP_ACTION_IP_RATE_LIMIT.maxTokens).toBeGreaterThanOrEqual(60)
    expect(GENERATIVE_APP_ACTION_IP_RATE_LIMIT.refillIntervalMs).toBeLessThanOrEqual(15 * 60_000)
  })
})

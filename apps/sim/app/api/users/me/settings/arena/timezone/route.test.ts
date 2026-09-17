/**
 * @vitest-environment node
 */
import { dbChainMockFns, resetDbChainMock } from '@sim/testing'
import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockGetSession, mockVerifyCronAuth } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockVerifyCronAuth: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
  getSession: mockGetSession,
}))

vi.mock('@/lib/auth/internal', () => ({
  verifyCronAuth: mockVerifyCronAuth,
}))

import { mapArenaTimezone } from '@/lib/users/arena-timezone'
import { PATCH } from '@/app/api/users/me/settings/arena/timezone/route'

const TIMEZONE_URL = 'http://localhost:3000/api/users/me/settings/arena/timezone'

function createTimezoneRequest(
  body: Record<string, string>,
  headers: Record<string, string> = {}
): NextRequest {
  return new NextRequest(TIMEZONE_URL, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('PATCH /api/users/me/settings/arena/timezone', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
    mockGetSession.mockResolvedValue(null)
    mockVerifyCronAuth.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )
    dbChainMockFns.limit.mockResolvedValue([])
  })

  it('maps the session user timezone and does not require CRON_SECRET', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-session', email: 'session@example.com' } })

    const response = await PATCH(
      createTimezoneRequest({ timeZone: 'US/Eastern', country: 'United States' })
    )
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({
      success: true,
      ...mapArenaTimezone({ timeZone: 'US/Eastern' }),
    })
    expect(mockVerifyCronAuth).not.toHaveBeenCalled()
    expect(dbChainMockFns.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-session', timezone: 'America/New_York' })
    )
  })

  it('rejects requests that have neither a session nor a valid CRON_SECRET', async () => {
    const response = await PATCH(createTimezoneRequest({ timeZone: 'Asia/Kolkata' }))

    expect(response.status).toBe(401)
    expect(mockVerifyCronAuth).toHaveBeenCalledWith(
      expect.any(NextRequest),
      'Arena timezone update'
    )
    expect(dbChainMockFns.insert).not.toHaveBeenCalled()
  })

  it('requires emailId when authenticating with CRON_SECRET', async () => {
    mockVerifyCronAuth.mockReturnValue(null)

    const response = await PATCH(
      createTimezoneRequest(
        { timeZone: 'Asia/Kolkata' },
        { Authorization: 'Bearer test-cron-secret' }
      )
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'emailId is required when authenticating with CRON_SECRET',
    })
    expect(dbChainMockFns.insert).not.toHaveBeenCalled()
  })

  it('accepts CRON_SECRET and stores the mapped timezone for the email user', async () => {
    mockVerifyCronAuth.mockReturnValue(null)
    dbChainMockFns.limit.mockResolvedValue([{ id: 'user-cron' }])

    const response = await PATCH(
      createTimezoneRequest(
        { time_zone: 'Asia/Kolkata', country: 'India', emailId: 'cron@example.com' },
        { Authorization: 'Bearer test-cron-secret' }
      )
    )

    const mapped = mapArenaTimezone({ timeZone: 'Asia/Kolkata' })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ success: true, ...mapped })
    expect(dbChainMockFns.values).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-cron', timezone: mapped?.timezone })
    )
  })

  it('returns 404 when the cron email does not match a user', async () => {
    mockVerifyCronAuth.mockReturnValue(null)

    const response = await PATCH(
      createTimezoneRequest(
        { country: 'India', emailId: 'missing@example.com' },
        { Authorization: 'Bearer test-cron-secret' }
      )
    )

    expect(response.status).toBe(404)
    expect(dbChainMockFns.insert).not.toHaveBeenCalled()
  })

  it('rejects a country that has no single timezone', async () => {
    mockGetSession.mockResolvedValue({ user: { id: 'user-session' } })

    const response = await PATCH(createTimezoneRequest({ country: 'United States' }))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      error: 'Timezone could not be mapped to a supported IANA timezone',
    })
    expect(dbChainMockFns.insert).not.toHaveBeenCalled()
  })
})

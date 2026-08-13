/**
 * @vitest-environment node
 */
import { authMockFns, dbChainMockFns, resetDbChainMock } from '@sim/testing'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GET } from '@/app/api/gui-apps/validate/route'

describe('Generative app identifier validate route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
    authMockFns.mockGetSession.mockResolvedValue({ user: { id: 'user-1' } })
  })

  it('returns 401 when the user is not authenticated', async () => {
    authMockFns.mockGetSession.mockResolvedValue(null)
    const req = new NextRequest('http://localhost:3000/api/gui-apps/validate?identifier=lead-score')
    const response = await GET(req)
    expect(response.status).toBe(401)
  })

  it('rejects the reserved identifier preview', async () => {
    const req = new NextRequest('http://localhost:3000/api/gui-apps/validate?identifier=preview')
    const response = await GET(req)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.available).toBe(false)
    expect(body.error).toMatch(/reserved/i)
    expect(dbChainMockFns.limit).not.toHaveBeenCalled()
  })

  it('returns available when the identifier is unused', async () => {
    dbChainMockFns.limit.mockResolvedValueOnce([])
    const req = new NextRequest('http://localhost:3000/api/gui-apps/validate?identifier=lead-score')
    const response = await GET(req)
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.available).toBe(true)
  })
})

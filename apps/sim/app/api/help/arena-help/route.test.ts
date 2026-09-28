/**
 * @vitest-environment node
 */
import { dbChainMockFns, resetDbChainMock } from '@sim/testing'
import { NextRequest, NextResponse } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockGetSession,
  mockVerifyCronAuth,
  mockPersistHelpSupportIssue,
  mockUploadHelpSupportAttachments,
  mockSendEmail,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockVerifyCronAuth: vi.fn(),
  mockPersistHelpSupportIssue: vi.fn(),
  mockUploadHelpSupportAttachments: vi.fn(),
  mockSendEmail: vi.fn(),
}))

vi.mock('@/lib/auth', () => ({
  auth: { api: { getSession: vi.fn() } },
  getSession: mockGetSession,
}))

vi.mock('@/lib/auth/internal', () => ({
  verifyCronAuth: mockVerifyCronAuth,
}))

vi.mock('@/lib/help/support-issue', () => ({
  persistHelpSupportIssue: mockPersistHelpSupportIssue,
  uploadHelpSupportAttachments: mockUploadHelpSupportAttachments,
  formatHelpSupportAttachmentLinks: () => '',
}))

vi.mock('@/lib/messaging/email/mailer', () => ({
  sendEmail: mockSendEmail,
}))

vi.mock('@/lib/messaging/email/utils', () => ({
  getFromEmailAddress: () => 'from@example.com',
}))

vi.mock('@/lib/core/utils/urls', () => ({
  getHelpInboxEmail: () => 'help@example.com',
}))

vi.mock('@/components/emails', () => ({
  renderHelpConfirmationEmail: vi.fn().mockResolvedValue('<p>received</p>'),
}))

import { POST } from '@/app/api/help/arena-help/route'

const HELP_URL = 'http://localhost:3000/api/help/arena-help'

function createHelpRequest(
  fields: Record<string, string>,
  headers: Record<string, string> = {}
): NextRequest {
  const formData = new FormData()
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value)
  }

  return new NextRequest(HELP_URL, {
    method: 'POST',
    headers,
    body: formData,
  })
}

const validFields = {
  subject: 'Broken agent',
  message: 'The reply never finishes.',
  type: 'bug',
}

describe('POST /api/help/arena-help', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
    mockGetSession.mockResolvedValue(null)
    mockVerifyCronAuth.mockReturnValue(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    )
    mockUploadHelpSupportAttachments.mockResolvedValue([])
    mockPersistHelpSupportIssue.mockResolvedValue(undefined)
    mockSendEmail.mockResolvedValue({ success: true })
    dbChainMockFns.limit.mockResolvedValue([])
  })

  it('keeps session auth and does not require CRON_SECRET', async () => {
    mockGetSession.mockResolvedValue({
      user: { id: 'user-session', email: 'session@example.com' },
    })

    const response = await POST(createHelpRequest(validFields))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toEqual({ success: true, message: 'Help request submitted successfully' })
    expect(mockVerifyCronAuth).not.toHaveBeenCalled()
    expect(mockPersistHelpSupportIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-session',
        userEmail: 'session@example.com',
        type: 'bug',
      })
    )
  })

  it('rejects requests that have neither a session nor a valid CRON_SECRET', async () => {
    const response = await POST(createHelpRequest(validFields))

    expect(response.status).toBe(401)
    expect(mockVerifyCronAuth).toHaveBeenCalledWith(expect.any(NextRequest), 'Arena help request')
    expect(mockPersistHelpSupportIssue).not.toHaveBeenCalled()
  })

  it('requires an email when authenticating with CRON_SECRET', async () => {
    mockVerifyCronAuth.mockReturnValue(null)

    const missingEmail = await POST(
      createHelpRequest(validFields, { Authorization: 'Bearer test-cron-secret' })
    )
    expect(missingEmail.status).toBe(400)
    expect(await missingEmail.json()).toEqual({
      error: 'email is required when authenticating with CRON_SECRET',
    })
    expect(mockPersistHelpSupportIssue).not.toHaveBeenCalled()
  })

  it('stores a null user id when the cron email is not an existing user', async () => {
    mockVerifyCronAuth.mockReturnValue(null)
    dbChainMockFns.limit.mockResolvedValue([])

    const response = await POST(
      createHelpRequest(
        { ...validFields, email: 'missing@example.com' },
        { Authorization: 'Bearer test-cron-secret' }
      )
    )

    expect(response.status).toBe(200)
    expect(mockSendEmail).toHaveBeenCalled()
    expect(mockPersistHelpSupportIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        userEmail: 'missing@example.com',
      })
    )
  })

  it('accepts CRON_SECRET and attributes the issue to the email user', async () => {
    mockVerifyCronAuth.mockReturnValue(null)
    dbChainMockFns.limit.mockResolvedValue([{ id: 'user-cron', email: 'cron@example.com' }])

    const response = await POST(
      createHelpRequest(
        { ...validFields, emailId: 'cron@example.com', workspaceId: 'ws-1' },
        { Authorization: 'Bearer test-cron-secret' }
      )
    )

    expect(response.status).toBe(200)
    expect(mockPersistHelpSupportIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-cron',
        userEmail: 'cron@example.com',
        workspaceId: 'ws-1',
      })
    )
  })
})

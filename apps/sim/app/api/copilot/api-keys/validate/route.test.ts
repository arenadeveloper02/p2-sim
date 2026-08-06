/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockFlags,
  mockDbLimit,
  mockCheckInternalApiKey,
  mockCheckMothershipUsageLimits,
  mockCheckSelfHostedMothershipUsageLimits,
  mockRequireBillingAttributionHeader,
  mockRequireBillingRequestIdHeader,
  mockResolveLegacyV0BillingAttribution,
  mockSerializeAccountBillingDecisionHeader,
  mockSerializeBillingAttributionHeader,
  mockGetHighestPrioritySubscription,
  mockDeriveBillingContext,
} = vi.hoisted(() => ({
  mockFlags: {
    isHosted: true,
    isCopilotBillingProtocolRequired: false,
  },
  mockDbLimit: vi.fn(),
  mockCheckInternalApiKey: vi.fn(),
  mockCheckMothershipUsageLimits: vi.fn(),
  mockCheckSelfHostedMothershipUsageLimits: vi.fn(),
  mockRequireBillingAttributionHeader: vi.fn(),
  mockRequireBillingRequestIdHeader: vi.fn(),
  mockResolveLegacyV0BillingAttribution: vi.fn(),
  mockSerializeAccountBillingDecisionHeader: vi.fn(),
  mockSerializeBillingAttributionHeader: vi.fn(),
  mockGetHighestPrioritySubscription: vi.fn(),
  mockDeriveBillingContext: vi.fn(),
}))

const ATTRIBUTION = {
  actorUserId: 'user-1',
  workspaceId: 'ws-1',
  billedAccountUserId: 'owner-1',
  organizationId: 'org-1',
  billingEntity: { type: 'organization' as const, id: 'org-1' },
  billingPeriod: {
    start: '2026-07-01T00:00:00.000Z',
    end: '2026-08-01T00:00:00.000Z',
  },
  payerSubscription: null,
}

vi.mock('@sim/db', () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: mockDbLimit }) }) }),
  },
}))

vi.mock('@/lib/billing/calculations/usage-monitor', () => ({
  checkMothershipUsageLimits: mockCheckMothershipUsageLimits,
  checkSelfHostedMothershipUsageLimits: mockCheckSelfHostedMothershipUsageLimits,
}))

vi.mock('@/lib/billing/core/billing-attribution', () => ({
  BILLING_ACCOUNT_DECISION_HEADER: 'x-sim-billing-account-decision',
  BILLING_ATTRIBUTION_HEADER: 'x-sim-billing-attribution',
  BILLING_REQUEST_ID_HEADER: 'x-sim-billing-request-id',
  COPILOT_BILLING_PROTOCOL: {
    attributed: 'attribution-v1',
    direct: 'direct-v1',
    legacy: 'legacy-v0',
  },
  COPILOT_BILLING_PROTOCOL_HEADER: 'x-sim-billing-protocol',
  requireBillingAttributionHeader: mockRequireBillingAttributionHeader,
  requireBillingRequestIdHeader: mockRequireBillingRequestIdHeader,
  resolveLegacyV0BillingAttribution: mockResolveLegacyV0BillingAttribution,
  serializeAccountBillingDecisionHeader: mockSerializeAccountBillingDecisionHeader,
  serializeBillingAttributionHeader: mockSerializeBillingAttributionHeader,
}))

vi.mock('@/lib/billing/core/plan', () => ({
  getHighestPrioritySubscription: mockGetHighestPrioritySubscription,
}))

vi.mock('@/lib/billing/core/usage-log', () => ({
  deriveBillingContext: mockDeriveBillingContext,
}))

vi.mock('@/lib/copilot/request/http', () => ({
  checkInternalApiKey: mockCheckInternalApiKey,
}))

vi.mock('@/lib/copilot/request/otel', () => ({
  withIncomingGoSpan: (
    _headers: unknown,
    _span: unknown,
    _attrs: unknown,
    fn: (span: { setAttribute: () => void; setAttributes: () => void }) => unknown
  ) => fn({ setAttribute: vi.fn(), setAttributes: vi.fn() }),
}))

vi.mock('@/lib/core/config/env-flags', () => ({
  get isHosted() {
    return mockFlags.isHosted
  },
  get isCopilotBillingProtocolRequired() {
    return mockFlags.isCopilotBillingProtocolRequired
  },
}))

import { POST } from '@/app/api/copilot/api-keys/validate/route'

function request(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return createMockRequest('POST', body, { 'x-api-key': 'internal', ...headers })
}

describe('POST /api/copilot/api-keys/validate — fork usage gate and billing protocol', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFlags.isHosted = true
    mockFlags.isCopilotBillingProtocolRequired = false
    mockCheckInternalApiKey.mockReturnValue({ success: true })
    mockDbLimit.mockResolvedValue([{ id: 'user-1' }])
    mockCheckMothershipUsageLimits.mockResolvedValue({ isExceeded: false })
    mockCheckSelfHostedMothershipUsageLimits.mockResolvedValue({
      isExceeded: false,
      currentUsage: 0,
      limit: 100,
    })
    mockRequireBillingRequestIdHeader.mockImplementation((headers: Headers) => {
      const value = headers.get('x-sim-billing-request-id')
      if (!value) throw new Error('missing billing request ID')
      return value
    })
    mockRequireBillingAttributionHeader.mockReturnValue(ATTRIBUTION)
    mockResolveLegacyV0BillingAttribution.mockResolvedValue(ATTRIBUTION)
    mockSerializeBillingAttributionHeader.mockReturnValue('serialized-attribution')
    mockSerializeAccountBillingDecisionHeader.mockReturnValue('serialized-account-decision')
    mockGetHighestPrioritySubscription.mockResolvedValue({ id: 'subscription-1' })
    mockDeriveBillingContext.mockReturnValue({
      billingEntity: { type: 'user', id: 'user-1' },
      billingPeriod: {
        start: new Date('2026-07-01T00:00:00.000Z'),
        end: new Date('2026-08-01T00:00:00.000Z'),
      },
    })
  })

  it('returns 402 when the hosted pooled limit is exceeded', async () => {
    mockCheckMothershipUsageLimits.mockResolvedValue({
      isExceeded: true,
      message: 'Organization usage limit exceeded',
      scope: 'pooled',
    })

    const response = await POST(request({ userId: 'user-1', workspaceId: 'ws-1' }))

    expect(response.status).toBe(402)
    expect(mockCheckMothershipUsageLimits).toHaveBeenCalledWith('user-1', 'ws-1')
  })

  it('returns 402 when the fork per-member cap is exceeded', async () => {
    mockCheckMothershipUsageLimits.mockResolvedValue({
      isExceeded: true,
      message: 'Member credit limit exceeded',
      scope: 'member',
    })

    const response = await POST(request({ userId: 'user-1', workspaceId: 'ws-1' }))

    expect(response.status).toBe(402)
    expect(mockCheckMothershipUsageLimits).toHaveBeenCalledWith('user-1', 'ws-1')
  })

  it('accepts markerless legacy traffic while protocol requirement is disabled', async () => {
    const response = await POST(request({ userId: 'user-1', workspaceId: 'ws-1' }))

    expect(response.status).toBe(200)
    expect(mockCheckMothershipUsageLimits).toHaveBeenCalledWith('user-1', 'ws-1')
    expect(response.headers.get('x-sim-billing-attribution')).toBeNull()
  })

  it('accepts the workspace-less markerless body through the fork account gate', async () => {
    const response = await POST(request({ userId: 'user-1' }))

    expect(response.status).toBe(200)
    expect(mockCheckMothershipUsageLimits).toHaveBeenCalledWith('user-1', undefined)
    expect(mockResolveLegacyV0BillingAttribution).not.toHaveBeenCalled()
  })

  it('uses self-hosted mothership limits when not hosted', async () => {
    mockFlags.isHosted = false

    const response = await POST(request({ userId: 'user-1', workspaceId: 'ws-1' }))

    expect(response.status).toBe(200)
    expect(mockCheckMothershipUsageLimits).not.toHaveBeenCalled()
    expect(mockCheckSelfHostedMothershipUsageLimits).toHaveBeenCalledWith('user-1')
  })

  it('preserves the member-limit 402 response on self-hosted limit failure', async () => {
    mockFlags.isHosted = false
    mockCheckSelfHostedMothershipUsageLimits.mockResolvedValue({
      isExceeded: true,
      currentUsage: 200,
      limit: 100,
    })

    const response = await POST(request({ userId: 'user-1', workspaceId: 'ws-1' }))

    expect(response.status).toBe(402)
    expect(mockCheckMothershipUsageLimits).not.toHaveBeenCalled()
  })

  it('validates attributed-v1 headers but still uses the fork gate', async () => {
    const response = await POST(
      request(
        { userId: 'user-1', workspaceId: 'ws-1' },
        {
          'x-sim-billing-protocol': 'attribution-v1',
          'x-sim-billing-request-id': '0190c03f-9f7d-4b79-8b58-e7f779fd29e1',
          'x-sim-billing-attribution': 'serialized-attribution',
        }
      )
    )

    expect(response.status).toBe(200)
    expect(mockRequireBillingAttributionHeader).toHaveBeenCalledWith(expect.anything(), {
      actorUserId: 'user-1',
      workspaceId: 'ws-1',
    })
    expect(mockCheckMothershipUsageLimits).toHaveBeenCalledWith('user-1', 'ws-1')
    expect(response.headers.get('x-sim-billing-attribution')).toBe('serialized-attribution')
  })

  it('rejects attributed-v1 without trusted attribution material', async () => {
    mockRequireBillingAttributionHeader.mockImplementationOnce(() => {
      throw new Error('missing billing attribution')
    })

    const response = await POST(
      request(
        { userId: 'user-1', workspaceId: 'ws-1' },
        {
          'x-sim-billing-protocol': 'attribution-v1',
          'x-sim-billing-request-id': '0190c03f-9f7d-4b79-8b58-e7f779fd29e1',
        }
      )
    )

    expect(response.status).toBe(400)
    expect(mockCheckMothershipUsageLimits).not.toHaveBeenCalled()
  })

  it('returns the additive account decision for direct-v1 without changing the gate', async () => {
    const response = await POST(
      request(
        { userId: 'user-1' },
        {
          'x-sim-billing-protocol': 'direct-v1',
          'x-sim-billing-request-id': '0190c03f-9f7d-4b79-8b58-e7f779fd29e1',
        }
      )
    )

    expect(response.status).toBe(200)
    expect(mockGetHighestPrioritySubscription).toHaveBeenCalledWith('user-1', {
      onError: 'throw',
    })
    expect(mockCheckMothershipUsageLimits).toHaveBeenCalledWith('user-1', undefined)
    expect(response.headers.get('x-sim-billing-account-decision')).toBe(
      'serialized-account-decision'
    )
  })

  it('rejects markerless traffic only when protocol requirement is enabled', async () => {
    mockFlags.isCopilotBillingProtocolRequired = true

    const response = await POST(request({ userId: 'user-1', workspaceId: 'ws-1' }))

    expect(response.status).toBe(400)
    expect(mockCheckMothershipUsageLimits).not.toHaveBeenCalled()
  })
})

/**
 * @vitest-environment node
 */
import {
  createMockRequest,
  queueTableRows,
  resetDbChainMock,
  resetEnvFlagsMock,
  schemaMock,
  setEnvFlags,
} from '@sim/testing'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const {
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

vi.mock('@/lib/billing/calculations/usage-monitor', () => ({
  checkMothershipUsageLimits: mockCheckMothershipUsageLimits,
  checkSelfHostedMothershipUsageLimits: mockCheckSelfHostedMothershipUsageLimits,
}))

const OLD_GO_HOSTED_VALIDATE_BODY = {
  userId: 'user-1',
  workspaceId: 'ws-1',
} as const

const OLD_GO_WORKSPACELESS_VALIDATE_BODY = {
  userId: 'user-1',
} as const

const OLD_GO_OPAQUE_WORKSPACE_VALIDATE_BODY = {
  userId: 'user-1',
  workspaceId: 'local-self-hosted-workspace',
} as const

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

import { validateCopilotApiKeyBodySchema } from '@/lib/api/contracts/copilot'
import { POST } from '@/app/api/copilot/api-keys/validate/route'

afterAll(resetEnvFlagsMock)

function request(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return createMockRequest('POST', body, { 'x-api-key': 'internal', ...headers })
}

describe('POST /api/copilot/api-keys/validate — fork usage gate and billing protocol', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetDbChainMock()
    setEnvFlags({ isHosted: true, isCopilotBillingProtocolRequired: false })
    mockCheckInternalApiKey.mockReturnValue({ success: true })
    queueTableRows(schemaMock.user, [{ id: 'user-1' }])
    mockCheckMothershipUsageLimits.mockResolvedValue({ isExceeded: false })
    mockCheckSelfHostedMothershipUsageLimits.mockResolvedValue({
      isExceeded: false,
      currentUsage: 0,
      limit: 100,
    })
    mockResolveLegacyV0BillingAttribution.mockResolvedValue(ATTRIBUTION)
    mockSerializeBillingAttributionHeader.mockReturnValue('serialized-attribution')
    mockSerializeAccountBillingDecisionHeader.mockReturnValue('serialized-account-decision')
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

  afterAll(() => {
    resetDbChainMock()
  })

  it('keeps the exact old-Go validate bodies contract-compatible', () => {
    expect(validateCopilotApiKeyBodySchema.safeParse(OLD_GO_HOSTED_VALIDATE_BODY).success).toBe(
      true
    )
    expect(
      validateCopilotApiKeyBodySchema.safeParse(OLD_GO_WORKSPACELESS_VALIDATE_BODY).success
    ).toBe(true)
    expect(
      validateCopilotApiKeyBodySchema.safeParse(OLD_GO_OPAQUE_WORKSPACE_VALIDATE_BODY).success
    ).toBe(true)
  })

  it('checks the routed workspace payer pool for exact markerless hosted admission', async () => {
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
    expect(mockResolveLegacyV0BillingAttribution).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      workspaceId: 'ws-1',
    })
  })

  it('preserves account admission for an opaque legacy workspace', async () => {
    mockResolveLegacyV0BillingAttribution.mockResolvedValueOnce(null)

    const response = await POST(request(OLD_GO_OPAQUE_WORKSPACE_VALIDATE_BODY))

    expect(response.status).toBe(200)
    expect(mockCheckMothershipUsageLimits).toHaveBeenCalledWith(
      'user-1',
      'local-self-hosted-workspace'
    )
    expect(response.headers.get('x-sim-billing-attribution')).toBeNull()
  })

  it('accepts the workspace-less markerless body through the fork account gate', async () => {
    const response = await POST(request({ userId: 'user-1' }))

    expect(response.status).toBe(200)
    expect(mockCheckMothershipUsageLimits).toHaveBeenCalledWith('user-1', undefined)
    expect(mockResolveLegacyV0BillingAttribution).not.toHaveBeenCalled()
  })

  it('uses self-hosted mothership limits when not hosted', async () => {
    setEnvFlags({ isHosted: false })

    const response = await POST(request({ userId: 'user-1', workspaceId: 'ws-1' }))

    expect(response.status).toBe(200)
    expect(mockCheckMothershipUsageLimits).not.toHaveBeenCalled()
    expect(mockCheckSelfHostedMothershipUsageLimits).toHaveBeenCalledWith('user-1')
  })

  it('preserves the member-limit 402 response on self-hosted limit failure', async () => {
    setEnvFlags({ isHosted: false })
    mockCheckSelfHostedMothershipUsageLimits.mockResolvedValue({
      isExceeded: true,
      currentUsage: 200,
      limit: 100,
    })

    const response = await POST(request({ userId: 'user-1', workspaceId: 'ws-1' }))

    expect(response.status).toBe(402)
    expect(mockCheckMothershipUsageLimits).not.toHaveBeenCalled()
  })

  it('rejects markerless admission only when protocol-required is explicitly enabled', async () => {
    setEnvFlags({ isCopilotBillingProtocolRequired: true })
    const res = await POST(request(OLD_GO_HOSTED_VALIDATE_BODY))

    expect(res.status).toBe(400)
    expect(mockCheckMothershipUsageLimits).not.toHaveBeenCalled()
    expect(mockCheckSelfHostedMothershipUsageLimits).not.toHaveBeenCalled()
  })

  it('allows explicitly labeled legacy requests when markerless traffic is disabled', async () => {
    setEnvFlags({ isCopilotBillingProtocolRequired: true })
    const res = await POST(
      request(OLD_GO_HOSTED_VALIDATE_BODY, { 'x-sim-billing-protocol': 'legacy-v0' })
    )

    expect(res.status).toBe(200)
    expect(mockCheckMothershipUsageLimits).toHaveBeenCalledWith('user-1', 'ws-1')
    expect(res.headers.get('x-sim-billing-attribution')).toBe('serialized-attribution')
    expect(mockResolveLegacyV0BillingAttribution).toHaveBeenCalledWith({
      actorUserId: 'user-1',
      workspaceId: 'ws-1',
    })
  })

  it('requires workspace attribution for explicitly labeled legacy requests', async () => {
    const res = await POST(request({ userId: 'user-1' }, { 'x-sim-billing-protocol': 'legacy-v0' }))

    expect(res.status).toBe(400)
    expect(mockCheckMothershipUsageLimits).not.toHaveBeenCalled()
  })

  it('uses the exact frozen attribution for attributed-v1 admission', async () => {
    const res = await POST(
      request(
        { userId: 'user-1', workspaceId: 'ws-1' },
        {
          'x-sim-billing-protocol': 'attribution-v1',
          'x-sim-billing-request-id': '0190c03f-9f7d-4b79-8b58-e7f779fd29e1',
          'x-sim-billing-attribution': 'serialized-attribution',
        }
      )
    )

    expect(res.status).toBe(200)
    expect(mockRequireBillingAttributionHeader).toHaveBeenCalledWith(expect.anything(), {
      actorUserId: 'user-1',
      workspaceId: 'ws-1',
    })
    expect(mockCheckMothershipUsageLimits).toHaveBeenCalledWith('user-1', 'ws-1')
  })

  it('fails attributed-v1 closed when attribution is missing', async () => {
    const res = await POST(
      request(
        { userId: 'user-1', workspaceId: 'ws-1' },
        {
          'x-sim-billing-protocol': 'attribution-v1',
          'x-sim-billing-request-id': '0190c03f-9f7d-4b79-8b58-e7f779fd29e1',
        }
      )
    )

    expect(res.status).toBe(400)
    expect(mockCheckMothershipUsageLimits).not.toHaveBeenCalled()
  })

  it('fails attributed-v1 closed when attribution mismatches actor or workspace', async () => {
    mockRequireBillingAttributionHeader.mockImplementationOnce(() => {
      throw new Error('billing attribution mismatch')
    })

    const res = await POST(
      request(
        { userId: 'user-1', workspaceId: 'ws-1' },
        {
          'x-sim-billing-protocol': 'attribution-v1',
          'x-sim-billing-request-id': '0190c03f-9f7d-4b79-8b58-e7f779fd29e1',
          'x-sim-billing-attribution': 'serialized-attribution',
        }
      )
    )

    expect(res.status).toBe(400)
    expect(mockCheckMothershipUsageLimits).not.toHaveBeenCalled()
  })

  it('admits a direct-v1 key without Redis while ignoring a local workspace ID', async () => {
    const res = await POST(
      request(
        { userId: 'user-1', workspaceId: 'local-self-hosted-workspace' },
        {
          'x-sim-billing-protocol': 'direct-v1',
          'x-sim-billing-request-id': '0190c03f-9f7d-4b79-8b58-e7f779fd29e1',
        }
      )
    )

    expect(res.status).toBe(200)
    expect(mockCheckMothershipUsageLimits).toHaveBeenCalledWith(
      'user-1',
      'local-self-hosted-workspace'
    )
    expect(res.headers.get('x-sim-billing-account-decision')).toBe('serialized-account-decision')
  })

  it('admits direct-v1 account billing when workspaceId is omitted', async () => {
    const res = await POST(
      request(
        { userId: 'user-1' },
        {
          'x-sim-billing-protocol': 'direct-v1',
          'x-sim-billing-request-id': '0190c03f-9f7d-4b79-8b58-e7f779fd29e1',
        }
      )
    )

    expect(res.status).toBe(200)
    expect(mockCheckMothershipUsageLimits).toHaveBeenCalledWith('user-1', undefined)
  })

  it('fails direct-v1 admission closed when its payer cannot be resolved', async () => {
    mockGetHighestPrioritySubscription.mockRejectedValueOnce(new Error('database unavailable'))

    const res = await POST(
      request(
        { userId: 'user-1' },
        {
          'x-sim-billing-protocol': 'direct-v1',
          'x-sim-billing-request-id': '0190c03f-9f7d-4b79-8b58-e7f779fd29e1',
        }
      )
    )

    expect(res.status).toBe(500)
    expect(mockCheckMothershipUsageLimits).not.toHaveBeenCalled()
  })

  it('does not return a direct-v1 account decision when usage admission returns 402', async () => {
    mockCheckMothershipUsageLimits.mockResolvedValueOnce({
      isExceeded: true,
      currentUsage: 200,
      limit: 100,
    })

    const response = await POST(
      request(
        { userId: 'user-1', workspaceId: 'ws-1' },
        {
          'x-sim-billing-protocol': 'direct-v1',
          'x-sim-billing-request-id': '0190c03f-9f7d-4b79-8b58-e7f779fd29e1',
        }
      )
    )

    expect(response.status).toBe(402)
    expect(mockCheckMothershipUsageLimits).toHaveBeenCalledWith('user-1', 'ws-1')
    expect(response.headers.get('x-sim-billing-account-decision')).toBeNull()
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
    setEnvFlags({ isCopilotBillingProtocolRequired: true })

    const response = await POST(request({ userId: 'user-1', workspaceId: 'ws-1' }))

    expect(response.status).toBe(400)
    expect(mockCheckMothershipUsageLimits).not.toHaveBeenCalled()
  })
})

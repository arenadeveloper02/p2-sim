/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
  mockCheckSessionOrInternalAuth,
  mockExecuteIdeogramOperation,
  mockDownloadFile,
  mockRecordUsage,
  mockDbSelect,
} = vi.hoisted(() => ({
  mockCheckSessionOrInternalAuth: vi.fn(),
  mockExecuteIdeogramOperation: vi.fn(),
  mockDownloadFile: vi.fn(),
  mockRecordUsage: vi.fn(),
  mockDbSelect: vi.fn(),
}))

vi.mock('@/lib/auth/hybrid', () => ({
  checkSessionOrInternalAuth: mockCheckSessionOrInternalAuth,
}))

vi.mock('@/app/api/tools/ideogram/server-utils', () => ({
  executeIdeogramOperation: mockExecuteIdeogramOperation,
  toIdeogramProxyErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : 'Ideogram error',
}))

vi.mock('@/lib/uploads/core/storage-service', () => ({
  downloadFile: mockDownloadFile,
}))

vi.mock('@/lib/billing/core/usage-log', () => ({
  recordUsage: mockRecordUsage,
}))

vi.mock('@/lib/core/config/env-flags', () => ({
  getCostMultiplier: () => 1,
}))

vi.mock('@sim/db', () => ({
  db: {
    select: mockDbSelect,
  },
}))

vi.mock('@sim/db/schema', () => ({
  workflow: { id: 'id', workspaceId: 'workspaceId' },
}))

import { POST } from '@/app/api/tools/ideogram/post-process/route'

describe('Ideogram post-process API', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockCheckSessionOrInternalAuth.mockResolvedValue({
      success: true,
      userId: 'user-1',
    })
    mockDownloadFile.mockResolvedValue(Buffer.from('png'))
    mockExecuteIdeogramOperation.mockResolvedValue({
      imageUrl: '/api/files/serve/agent-generated-images/wf-1/user-1/result.png',
    })
    mockRecordUsage.mockResolvedValue(undefined)

    const limit = vi.fn().mockResolvedValue([{ workspaceId: 'ws-1' }])
    const where = vi.fn().mockReturnValue({ limit })
    const from = vi.fn().mockReturnValue({ where })
    mockDbSelect.mockReturnValue({ from })
  })

  it('records usage_log with source image-post-process after success', async () => {
    const imageUrl = '/api/files/serve/agent-generated-images/wf-1/user-1/source.png'
    const request = createMockRequest('POST', {
      operation: 'remove_background',
      imageUrl,
      workflowId: 'wf-1',
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockRecordUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        workspaceId: 'ws-1',
        workflowId: 'wf-1',
        entries: [
          expect.objectContaining({
            category: 'tool',
            source: 'image-post-process',
            toolId: 'ideogram_remove_background',
            vendor: 'ideogram',
            cost: expect.any(Number),
          }),
        ],
      })
    )
  })

  it('rejects invalid reframe resolutions before calling Ideogram', async () => {
    const imageUrl = '/api/files/serve/agent-generated-images/wf-1/user-1/source.png'
    const request = createMockRequest('POST', {
      operation: 'reframe_v3',
      imageUrl,
      workflowId: 'wf-1',
      resolution: '1440x2560',
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
    expect(mockExecuteIdeogramOperation).not.toHaveBeenCalled()
    expect(mockRecordUsage).not.toHaveBeenCalled()
  })
})

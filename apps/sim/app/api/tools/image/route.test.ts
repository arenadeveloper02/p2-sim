/**
 * @vitest-environment node
 */
import { createMockRequest } from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCheckInternalAuth, mockUploadExecutionFile, mockSecureFetch, mockValidateUrl } =
  vi.hoisted(() => ({
    mockCheckInternalAuth: vi.fn(),
    mockUploadExecutionFile: vi.fn(),
    mockSecureFetch: vi.fn(),
    mockValidateUrl: vi.fn(),
  }))

vi.mock('@/lib/auth/hybrid', () => ({
  checkInternalAuth: mockCheckInternalAuth,
}))

vi.mock('@/lib/uploads/contexts/execution', () => ({
  uploadExecutionFile: mockUploadExecutionFile,
}))

vi.mock('@/lib/core/security/input-validation.server', () => ({
  validateUrlWithDNS: mockValidateUrl,
  secureFetchWithPinnedIP: mockSecureFetch,
}))

import { POST } from '@/app/api/tools/image/route'

function createIdeogramApiResponse(overrides: Record<string, unknown> = {}) {
  const payload = JSON.stringify({
    data: [
      {
        url: 'https://ideogram.ai/generated.png',
        prompt: 'Revised prompt',
        is_image_safe: true,
        seed: 42,
        ...overrides,
      },
    ],
  })

  return {
    ok: true,
    headers: {
      get: (name: string) => {
        const normalized = name.toLowerCase()
        if (normalized === 'content-length') return String(Buffer.byteLength(payload, 'utf-8'))
        return null
      },
    },
    text: async () => payload,
  }
}

describe('Image API Route - Ideogram', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockCheckInternalAuth.mockResolvedValue({
      success: true,
      userId: 'user-123',
    })
    mockValidateUrl.mockResolvedValue({
      isValid: true,
      resolvedIP: '127.0.0.1',
    })
    mockSecureFetch.mockResolvedValue({
      ok: true,
      headers: {
        get: (name: string) => {
          const normalized = name.toLowerCase()
          if (normalized === 'content-type') return 'image/png'
          if (normalized === 'content-length') return '3'
          return null
        },
      },
      arrayBuffer: async () => Uint8Array.from([1, 2, 3]).buffer,
    })
    mockUploadExecutionFile.mockResolvedValue({
      url: 'https://sim.test/files/generated.png',
      name: 'generated.png',
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(createIdeogramApiResponse()))
  })

  it('generates with text_prompt for Ideogram BYOK', async () => {
    const request = createMockRequest('POST', {
      provider: 'ideogram',
      apiKey: 'ideogram-key',
      model: 'ideogram-v4',
      prompt: 'A studio product photo',
      resolution: '2048x2048',
      renderingSpeed: 'DEFAULT',
      workspaceId: 'ws-1',
      workflowId: 'wf-1',
      executionId: 'exec-1',
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.provider).toBe('ideogram')
    expect(data.model).toBe('ideogram-v4')
    expect(data.imageUrl).toBe('https://sim.test/files/generated.png')
    expect(mockUploadExecutionFile).toHaveBeenCalled()
  })

  it('generates with json_prompt when prompt is omitted', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
      const body = init?.body as FormData
      expect(body.get('json_prompt')).toBeTruthy()
      expect(body.get('text_prompt')).toBeNull()
      return createIdeogramApiResponse()
    })
    vi.stubGlobal('fetch', fetchMock)

    const request = createMockRequest('POST', {
      provider: 'ideogram',
      apiKey: 'ideogram-key',
      jsonPrompt: {
        high_level_description: 'Poster',
        compositional_deconstruction: {
          background: 'Gradient',
          elements: [],
        },
      },
      workspaceId: 'ws-1',
      workflowId: 'wf-1',
      executionId: 'exec-1',
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
    expect(fetchMock).toHaveBeenCalled()
  })

  it('uses IDEOGRAM_API_KEY from the server when block apiKey is omitted', async () => {
    process.env.IDEOGRAM_API_KEY = 'server-ideogram-key'

    const request = createMockRequest('POST', {
      provider: 'ideogram',
      prompt: 'Use server key',
      workspaceId: 'ws-1',
      workflowId: 'wf-1',
      executionId: 'exec-1',
    })

    const response = await POST(request)
    expect(response.status).toBe(200)
  })

  it('rejects Ideogram requests without an API key when server key is unset', async () => {
    const previousKey = process.env.IDEOGRAM_API_KEY
    process.env.IDEOGRAM_API_KEY = ''

    const request = createMockRequest('POST', {
      provider: 'ideogram',
      prompt: 'Missing key',
    })

    const response = await POST(request)
    expect(response.status).toBe(500)

    process.env.IDEOGRAM_API_KEY = previousKey
  })
})

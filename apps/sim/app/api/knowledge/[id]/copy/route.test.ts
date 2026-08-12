/**
 * Regression tests for knowledge base copy API route.
 * Ensures auth, access checks, and error mapping stay correct without
 * changing GET/PUT/DELETE behavior on the parent KB routes.
 *
 * @vitest-environment node
 */
import {
  auditMock,
  auditMockFns,
  authMockFns,
  createMockRequest,
  knowledgeApiUtilsMock,
} from '@sim/testing'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockCopyKnowledgeBaseToWorkspace, KnowledgeBaseCopyError } = vi.hoisted(() => {
  class KnowledgeBaseCopyError extends Error {
    readonly code = 'KNOWLEDGE_BASE_COPY_FAILED' as const
  }
  return {
    mockCopyKnowledgeBaseToWorkspace: vi.fn(),
    KnowledgeBaseCopyError,
  }
})

vi.mock('@sim/audit', () => auditMock)

vi.mock('@/lib/knowledge/copy', () => ({
  copyKnowledgeBaseToWorkspace: mockCopyKnowledgeBaseToWorkspace,
  KnowledgeBaseCopyError,
}))

vi.mock('@/lib/knowledge/service', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/knowledge/service')>()
  return {
    ...actual,
    KnowledgeBasePermissionError: actual.KnowledgeBasePermissionError,
    KnowledgeBaseConflictError: actual.KnowledgeBaseConflictError,
  }
})

vi.mock('@/app/api/knowledge/utils', () => knowledgeApiUtilsMock)

import { KnowledgeBaseConflictError, KnowledgeBasePermissionError } from '@/lib/knowledge/service'
import { POST } from '@/app/api/knowledge/[id]/copy/route'
import { checkKnowledgeBaseWriteAccess } from '@/app/api/knowledge/utils'

describe('POST /api/knowledge/[id]/copy', () => {
  const mockParams = Promise.resolve({ id: 'kb-source' })
  const validBody = {
    targetWorkspaceId: 'ws-target',
    name: 'Copied KB',
  }

  const copiedKb = {
    id: 'kb-copied',
    userId: 'user-123',
    name: 'Copied KB',
    description: null,
    tokenCount: 10,
    embeddingModel: 'text-embedding-3-small',
    embeddingDimension: 1536,
    chunkingConfig: { maxSize: 1024, minSize: 100, overlap: 200 },
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    workspaceId: 'ws-target',
    docCount: 1,
    connectorTypes: [],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    authMockFns.mockGetSession.mockResolvedValue({
      user: { id: 'user-123', name: 'Test User', email: 'test@example.com' },
    })
    vi.mocked(checkKnowledgeBaseWriteAccess).mockResolvedValue({
      hasAccess: true,
      knowledgeBase: {
        id: 'kb-source',
        userId: 'user-123',
        name: 'Source KB',
        workspaceId: 'ws-source',
      },
    })
    mockCopyKnowledgeBaseToWorkspace.mockResolvedValue(copiedKb)
  })

  it('copies a knowledge base for an authenticated user with write access', async () => {
    const req = createMockRequest('POST', validBody)
    const response = await POST(req, { params: mockParams })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.data.id).toBe('kb-copied')
    expect(checkKnowledgeBaseWriteAccess).toHaveBeenCalledWith('kb-source', 'user-123')
    expect(mockCopyKnowledgeBaseToWorkspace).toHaveBeenCalledWith({
      sourceKnowledgeBaseId: 'kb-source',
      targetWorkspaceId: 'ws-target',
      name: 'Copied KB',
      userId: 'user-123',
      requestId: expect.any(String),
    })
    expect(auditMockFns.mockRecordAudit).toHaveBeenCalled()
  })

  it('returns 401 for unauthenticated users and does not copy', async () => {
    authMockFns.mockGetSession.mockResolvedValue(null)

    const req = createMockRequest('POST', validBody)
    const response = await POST(req, { params: mockParams })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
    expect(mockCopyKnowledgeBaseToWorkspace).not.toHaveBeenCalled()
  })

  it('returns 404 when the source knowledge base is not found', async () => {
    vi.mocked(checkKnowledgeBaseWriteAccess).mockResolvedValueOnce({
      hasAccess: false,
      notFound: true,
    })

    const req = createMockRequest('POST', validBody)
    const response = await POST(req, { params: mockParams })
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Knowledge base not found')
    expect(mockCopyKnowledgeBaseToWorkspace).not.toHaveBeenCalled()
  })

  it('returns 401 when the user lacks write access on the source KB', async () => {
    vi.mocked(checkKnowledgeBaseWriteAccess).mockResolvedValueOnce({
      hasAccess: false,
      notFound: false,
    })

    const req = createMockRequest('POST', validBody)
    const response = await POST(req, { params: mockParams })
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Unauthorized')
    expect(mockCopyKnowledgeBaseToWorkspace).not.toHaveBeenCalled()
  })

  it('returns 400 when targetWorkspaceId is missing', async () => {
    const req = createMockRequest('POST', { name: 'Copied KB' })
    const response = await POST(req, { params: mockParams })

    expect(response.status).toBe(400)
    expect(mockCopyKnowledgeBaseToWorkspace).not.toHaveBeenCalled()
  })

  it('returns 403 when the user cannot write to the target workspace', async () => {
    mockCopyKnowledgeBaseToWorkspace.mockRejectedValueOnce(
      new KnowledgeBasePermissionError(
        'User does not have permission to create knowledge bases in the target workspace'
      )
    )

    const req = createMockRequest('POST', validBody)
    const response = await POST(req, { params: mockParams })
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toContain('target workspace')
  })

  it('returns 409 when the target name already exists', async () => {
    mockCopyKnowledgeBaseToWorkspace.mockRejectedValueOnce(
      new KnowledgeBaseConflictError('Copied KB')
    )

    const req = createMockRequest('POST', validBody)
    const response = await POST(req, { params: mockParams })
    const data = await response.json()

    expect(response.status).toBe(409)
    expect(data.error).toContain('Copied KB')
  })

  it('returns 400 when copying into the same workspace', async () => {
    mockCopyKnowledgeBaseToWorkspace.mockRejectedValueOnce(
      new KnowledgeBaseCopyError('Cannot copy a knowledge base into the same workspace')
    )

    const req = createMockRequest('POST', validBody)
    const response = await POST(req, { params: mockParams })
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Cannot copy a knowledge base into the same workspace')
  })

  it('returns 500 on unexpected copy failures', async () => {
    mockCopyKnowledgeBaseToWorkspace.mockRejectedValueOnce(new Error('boom'))

    const req = createMockRequest('POST', validBody)
    const response = await POST(req, { params: mockParams })
    const data = await response.json()

    expect(response.status).toBe(500)
    expect(data.error).toBe('Failed to copy knowledge base')
  })
})

/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUploadFile, mockGetBaseUrl } = vi.hoisted(() => ({
  mockUploadFile: vi.fn(),
  mockGetBaseUrl: vi.fn(),
}))

vi.mock('@/lib/uploads', () => ({
  StorageService: {
    uploadFile: mockUploadFile,
  },
}))

vi.mock('@/lib/core/utils/urls', () => ({
  getBaseUrl: mockGetBaseUrl,
}))

import { uploadExecutionFile } from '@/lib/uploads/contexts/execution/execution-file-manager'

describe('uploadExecutionFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetBaseUrl.mockReturnValue('https://agent.thearena.ai')
    mockUploadFile.mockResolvedValue({
      key: 'execution/workspace-1/workflow-1/execution-1/generated.png',
      path: '/api/files/serve/execution%2Fworkspace-1%2Fworkflow-1%2Fexecution-1%2Fgenerated.png',
    })
  })

  it('returns storage metadata without eager base64 payload', async () => {
    const result = await uploadExecutionFile(
      {
        workspaceId: 'workspace-1',
        workflowId: 'workflow-1',
        executionId: 'execution-1',
      },
      Buffer.from('image-bytes'),
      'generated.png',
      'image/png',
      'user-1'
    )

    expect(result).toMatchObject({
      name: 'generated.png',
      size: 11,
      type: 'image/png',
      url: 'https://agent.thearena.ai/api/files/serve/execution%2Fworkspace-1%2Fworkflow-1%2Fexecution-1%2Fgenerated.png',
      key: 'execution/workspace-1/workflow-1/execution-1/generated.png',
      context: 'execution',
    })
    expect(result).not.toHaveProperty('base64')
  })
})

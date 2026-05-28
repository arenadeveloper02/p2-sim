/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUploadFile, mockGeneratePresignedDownloadUrl } = vi.hoisted(() => ({
  mockUploadFile: vi.fn(),
  mockGeneratePresignedDownloadUrl: vi.fn(),
}))

vi.mock('@/lib/uploads', () => ({
  StorageService: {
    uploadFile: mockUploadFile,
    generatePresignedDownloadUrl: mockGeneratePresignedDownloadUrl,
  },
}))

import { uploadExecutionFile } from '@/lib/uploads/contexts/execution/execution-file-manager'

describe('uploadExecutionFile', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUploadFile.mockResolvedValue({
      key: 'execution/workspace-1/workflow-1/execution-1/generated.png',
    })
    mockGeneratePresignedDownloadUrl.mockResolvedValue('https://files.example.com/generated.png')
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
      url: 'https://files.example.com/generated.png',
      key: 'execution/workspace-1/workflow-1/execution-1/generated.png',
      context: 'execution',
    })
    expect(result).not.toHaveProperty('base64')
  })
})

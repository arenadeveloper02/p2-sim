/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockProcessExecutionFiles, mockDownloadFile, mockUploadExecutionFile } = vi.hoisted(() => ({
  mockProcessExecutionFiles: vi.fn(),
  mockDownloadFile: vi.fn(),
  mockUploadExecutionFile: vi.fn(),
}))

vi.mock('@/lib/execution/files', () => ({
  processExecutionFiles: mockProcessExecutionFiles,
}))

vi.mock('@/lib/uploads/core/storage-service', () => ({
  downloadFile: mockDownloadFile,
}))

vi.mock('@/lib/uploads/contexts/execution/execution-file-manager', () => ({
  uploadExecutionFile: mockUploadExecutionFile,
}))

import { processChatFiles } from '@/lib/uploads/contexts/chat/chat-file-manager'

describe('processChatFiles', () => {
  const executionContext = {
    workspaceId: 'workspace-1',
    workflowId: 'workflow-1',
    executionId: 'execution-1',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockProcessExecutionFiles.mockResolvedValue([])
    mockDownloadFile.mockResolvedValue(Buffer.from('png'))
    mockUploadExecutionFile.mockResolvedValue({
      id: 'copied-1',
      name: 'image.png',
      size: 3,
      type: 'image/png',
      url: 'https://example.com/execution-file',
      key: 'execution/workspace-1/workflow-1/execution-1/copy/image.png',
      context: 'execution',
    })
  })

  it('copies a generated image from this workflow into the current execution', async () => {
    const files = await processChatFiles(
      [
        {
          url: 'http://localhost:3000/api/files/serve/agent-generated-images%2Fworkflow-1%2Fuser-1%2Fimage.png',
          name: 'image.png',
          type: 'image/png',
        },
      ],
      executionContext,
      'request-1',
      'user-1'
    )

    expect(mockProcessExecutionFiles).not.toHaveBeenCalled()
    expect(mockDownloadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'agent-generated-images/workflow-1/user-1/image.png',
        context: 'agent-generated-images',
      })
    )
    expect(mockUploadExecutionFile).toHaveBeenCalledWith(
      executionContext,
      expect.any(Buffer),
      'image.png',
      'image/png',
      'user-1'
    )
    expect(files).toHaveLength(1)
    expect(files[0]?.key).toContain('execution/')
    expect(files[0]?.context).toBe('execution')
  })

  it('does not copy a generated image from another workflow', async () => {
    await processChatFiles(
      [
        {
          url: 'http://localhost:3000/api/files/serve/agent-generated-images%2Fother-workflow%2Fuser-1%2Fimage.png',
          name: 'image.png',
          type: 'image/png',
        },
      ],
      executionContext,
      'request-1'
    )

    expect(mockDownloadFile).not.toHaveBeenCalled()
    expect(mockUploadExecutionFile).not.toHaveBeenCalled()
    expect(mockProcessExecutionFiles).toHaveBeenCalledOnce()
  })

  it('uploads fresh base64 attachments to execution storage', async () => {
    mockProcessExecutionFiles.mockResolvedValue([
      {
        id: 'uploaded-1',
        name: 'upload.png',
        size: 128,
        type: 'image/png',
        url: 'https://example.com/file',
        key: 'execution/workspace-1/workflow-1/execution-1/upload.png',
        context: 'execution',
      },
    ])

    const files = await processChatFiles(
      [
        {
          dataUrl: 'data:image/png;base64,abc',
          name: 'upload.png',
          type: 'image/png',
        },
      ],
      executionContext,
      'request-1'
    )

    expect(mockProcessExecutionFiles).toHaveBeenCalledOnce()
    expect(files[0]?.key).toContain('execution/')
  })
})

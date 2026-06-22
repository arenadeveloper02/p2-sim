/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUploadExecutionFile, mockDownloadFileFromUrl } = vi.hoisted(() => ({
  mockUploadExecutionFile: vi.fn(),
  mockDownloadFileFromUrl: vi.fn(),
}))

vi.mock('@/lib/uploads/contexts/execution', () => ({
  uploadExecutionFile: mockUploadExecutionFile,
  uploadFileFromRawData: vi.fn(),
}))

vi.mock('@/lib/uploads/utils/file-utils.server', () => ({
  downloadFileFromUrl: mockDownloadFileFromUrl,
}))

import { FileToolProcessor } from '@/executor/utils/file-tool-processor'
import type { ExecutionContext } from '@/executor/types'
import type { ToolConfig } from '@/tools/types'

describe('FileToolProcessor', () => {
  const executionContext: ExecutionContext = {
    workspaceId: 'workspace-1',
    workflowId: 'workflow-1',
    executionId: 'execution-1',
    userId: 'user-1',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockDownloadFileFromUrl.mockResolvedValue(Buffer.from('image-bytes'))
    mockUploadExecutionFile.mockResolvedValue({
      id: 'file_1',
      key: 'exec/key.png',
      name: 'generated-image.png',
      url: 'https://example.com/file.png',
      size: 11,
      type: 'image/png',
      context: 'execution',
    })
  })

  it('processes bare image URL strings for file outputs', async () => {
    const toolConfig = {
      outputs: {
        image: { type: 'file', description: 'Generated image file' },
      },
    } as ToolConfig

    const processed = await FileToolProcessor.processToolOutputs(
      {
        image: 'https://example.com/generated.png',
      },
      toolConfig,
      executionContext
    )

    expect(mockDownloadFileFromUrl).toHaveBeenCalledWith('https://example.com/generated.png', {
      userId: 'user-1',
    })
    expect(mockUploadExecutionFile).toHaveBeenCalled()
    expect(processed.image).toMatchObject({
      id: 'file_1',
      url: 'https://example.com/file.png',
    })
  })

  it('skips unprocessable file outputs instead of throwing', async () => {
    const toolConfig = {
      outputs: {
        image: { type: 'file', description: 'Generated image file' },
      },
    } as ToolConfig

    const processed = await FileToolProcessor.processToolOutputs(
      {
        image: {},
      },
      toolConfig,
      executionContext
    )

    expect(processed.image).toEqual({})
    expect(mockDownloadFileFromUrl).not.toHaveBeenCalled()
    expect(mockUploadExecutionFile).not.toHaveBeenCalled()
  })
})

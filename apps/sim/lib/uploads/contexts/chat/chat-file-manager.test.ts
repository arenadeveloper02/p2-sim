/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockProcessExecutionFiles } = vi.hoisted(() => ({
  mockProcessExecutionFiles: vi.fn(),
}))

vi.mock('@/lib/execution/files', () => ({
  processExecutionFiles: mockProcessExecutionFiles,
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
  })

  it('reuses durable internal generated-image references without re-uploading', async () => {
    const files = await processChatFiles(
      [
        {
          url: 'http://localhost:3000/api/files/serve/agent-generated-images%2Fworkflow-1%2Fuser-1%2Fimage.png',
          name: 'image.png',
          type: 'image/png',
        },
      ],
      executionContext,
      'request-1'
    )

    expect(mockProcessExecutionFiles).not.toHaveBeenCalled()
    expect(files).toHaveLength(1)
    expect(files[0]?.key).toBe('agent-generated-images/workflow-1/user-1/image.png')
    expect(files[0]?.context).toBe('agent-generated-images')
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

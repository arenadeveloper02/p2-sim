/**
 * @vitest-environment node
 */
import { describe, expect, it, vi } from 'vitest'
import {
  reuseStoredWorkflowAttachment,
  uploadWorkflowAttachments,
} from '@/app/workspace/[workspaceId]/w/[workflowId]/utils/workflow-attachment-upload'

vi.mock('@/lib/uploads/client/direct-upload', () => ({
  DirectUploadError: class DirectUploadError extends Error {
    code?: string
    details?: unknown
  },
  runUploadStrategy: vi.fn(() => {
    throw new Error('runUploadStrategy should not be called for stored generated images')
  }),
}))

describe('reuseStoredWorkflowAttachment', () => {
  it('reuses internal serve URLs with a positive size', () => {
    const result = reuseStoredWorkflowAttachment({
      name: 'Generated image',
      size: 1,
      type: 'image/png',
      file: new File([], 'Generated image', { type: 'image/png' }),
      url: '/api/files/serve/agent-generated-images%2Fwf%2Fuser%2Fimage.png',
      dataUrl:
        'https://chat.example.com/api/files/proxy-image?url=https%3A%2F%2Fapp.example.com%2Fapi%2Ffiles%2Fserve%2Fimg.png',
    })

    expect(result).toMatchObject({
      name: 'Generated image',
      size: 1,
      type: 'image/png',
      key: 'agent-generated-images/wf/user/image.png',
      context: 'agent-generated-images',
      url: '/api/files/serve/agent-generated-images%2Fwf%2Fuser%2Fimage.png',
    })
  })
})

describe('uploadWorkflowAttachments', () => {
  it('does not re-upload generated images that already have a serve URL', async () => {
    const uploaded = await uploadWorkflowAttachments({
      files: [
        {
          name: 'Generated image',
          size: 1,
          type: 'image/jpeg',
          file: new File([], 'Generated image', { type: 'image/jpeg' }),
          url: 'http://localhost:3000/api/files/serve/agent-generated-images/wf/user/image.jpeg',
        },
      ],
      workspaceId: 'workspace-1',
      workflowId: 'workflow-1',
      executionId: 'execution-1',
    })

    expect(uploaded).toHaveLength(1)
    expect(uploaded[0]).toMatchObject({
      name: 'Generated image',
      size: 1,
      type: 'image/jpeg',
      key: 'agent-generated-images/wf/user/image.jpeg',
      context: 'agent-generated-images',
    })
  })
})

/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { buildImageToolBodyFromExecutionParams } from '@/lib/image-generation/run-image-tool.server'

describe('buildImageToolBodyFromExecutionParams', () => {
  it('maps execution context and reference image fields onto the image tool body', () => {
    const body = buildImageToolBodyFromExecutionParams({
      provider: 'openai',
      model: 'gpt-image-2',
      prompt: 'Edit this image',
      inputImage: { key: 'file-key', url: '/api/files/serve/file-key' },
      __usingHostedKey: true,
      _context: {
        userId: 'user-123',
        workspaceId: 'workspace-123',
        workflowId: 'workflow-123',
        executionId: 'execution-123',
      },
    })

    expect(body).toMatchObject({
      provider: 'openai',
      model: 'gpt-image-2',
      prompt: 'Edit this image',
      inputImage: { key: 'file-key', url: '/api/files/serve/file-key' },
      workspaceId: 'workspace-123',
      workflowId: 'workflow-123',
      executionId: 'execution-123',
      userId: 'user-123',
      useHostedCostTracking: true,
    })
  })
})

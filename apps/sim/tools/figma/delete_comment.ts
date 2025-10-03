import type { ToolConfig } from '@/tools/types'
import type { DeleteCommentParams, DeleteCommentResponse } from './types'

export const deleteCommentTool: ToolConfig<DeleteCommentParams, DeleteCommentResponse> = {
  id: 'delete_comment',
  name: 'Delete Figma Comment',
  description: 'Delete a comment from a Figma file',
  version: '1.0.0',
  params: {
    fileKey: {
      type: 'string',
      description: 'Figma file key',
      required: true,
      visibility: 'user-or-llm',
    },
    commentId: {
      type: 'string',
      description: 'Comment ID to delete',
      required: true,
      visibility: 'user-or-llm',
    },
  },
  request: {
    url: (params) =>
      `https://api.figma.com/v1/files/${params.fileKey}/comments/${params.commentId}`,
    method: 'DELETE',
    headers: () => ({
      'X-Figma-Token': process.env.FIGMA_API_KEY || '',
    }),
  },
  transformResponse: async (response) => {
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        `Figma API error: ${response.status} ${response.statusText}. ${
          errorData.message || 'Unknown error'
        }`
      )
    }

    return {
      success: true,
      output: {
        content: `Successfully deleted comment from Figma file`,
        metadata: {
          success: true,
          commentId: '',
        },
      },
    }
  },
  outputs: {
    content: {
      type: 'string',
      description: 'Comment deletion result',
    },
    metadata: {
      type: 'object',
      description: 'Deletion metadata',
      properties: {
        success: { type: 'boolean', description: 'Whether deletion was successful' },
        commentId: { type: 'string', description: 'Deleted comment ID' },
      },
    },
  },
}

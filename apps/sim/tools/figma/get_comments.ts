import type { ToolConfig } from '@/tools/types'
import type { GetCommentsParams, GetCommentsResponse } from './types'

export const getCommentsTool: ToolConfig<GetCommentsParams, GetCommentsResponse> = {
  id: 'get_comments',
  name: 'Get Figma Comments',
  description: 'Retrieve comments from a Figma file',
  version: '1.0.0',
  params: {
    fileKey: {
      type: 'string',
      description: 'Figma file key',
      required: true,
      visibility: 'user-or-llm',
    },
    nodeId: {
      type: 'string',
      description: 'Specific node ID to get comments for (optional)',
      required: false,
      visibility: 'user-or-llm',
    },
  },
  request: {
    url: (params) =>
      `https://api.figma.com/v1/files/${params.fileKey}/comments${params.nodeId ? `?node_id=${params.nodeId}` : ''}`,
    method: 'GET',
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

    const data = await response.json()
    const comments = data.comments || []

    return {
      success: true,
      output: {
        content: `Retrieved ${comments.length} comments from Figma file`,
        metadata: {
          comments,
          fileKey: data.file_key || '',
          nodeId: data.node_id || 'all',
        },
      },
    }
  },
  outputs: {
    content: {
      type: 'string',
      description: 'Comments data and summary',
    },
    metadata: {
      type: 'object',
      description: 'Comments metadata',
      properties: {
        comments: {
          type: 'array',
          description: 'Array of comment objects',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', description: 'Comment ID' },
              file_key: { type: 'string', description: 'File key' },
              parent_id: { type: 'string', description: 'Parent comment ID' },
              user: {
                type: 'object',
                properties: {
                  id: { type: 'string', description: 'User ID' },
                  handle: { type: 'string', description: 'User handle' },
                  img_url: { type: 'string', description: 'User avatar URL' },
                },
              },
              created_at: { type: 'string', description: 'Creation timestamp' },
              resolved_at: { type: 'string', description: 'Resolution timestamp' },
              message: { type: 'string', description: 'Comment message' },
              client_meta: {
                type: 'object',
                properties: {
                  x: { type: 'number', description: 'X coordinate' },
                  y: { type: 'number', description: 'Y coordinate' },
                  node_id: { type: 'string', description: 'Node ID' },
                  node_offset: {
                    type: 'object',
                    properties: {
                      x: { type: 'number', description: 'X offset' },
                      y: { type: 'number', description: 'Y offset' },
                    },
                  },
                },
              },
              order_id: { type: 'string', description: 'Order ID' },
            },
          },
        },
        fileKey: { type: 'string', description: 'File key' },
        nodeId: { type: 'string', description: 'Node ID' },
      },
    },
  },
}

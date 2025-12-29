import { createLogger } from '@sim/logger'
import type { ToolConfig } from '@/tools/types'
import type { PostCommentParams, PostCommentResponse } from './types'

const logger = createLogger('PostCommentTool')

export const postCommentTool: ToolConfig<PostCommentParams, PostCommentResponse> = {
  id: 'post_comment',
  name: 'Post Figma Comment',
  description: 'Post a comment to a Figma file',
  version: '1.0.0',
  params: {
    fileKey: {
      type: 'string',
      description: 'Figma file key',
      required: true,
      visibility: 'user-or-llm',
    },
    message: {
      type: 'string',
      description: 'Comment message',
      required: true,
      visibility: 'user-or-llm',
    },
    // x: {
    //   type: 'number',
    //   description: 'X coordinate for comment position (optional)',
    //   required: false,
    //   visibility: 'user-or-llm',
    // },
    // y: {
    //   type: 'number',
    //   description: 'Y coordinate for comment position (optional)',
    //   required: false,
    //   visibility: 'user-or-llm',
    // },
    // nodeId: {
    //   type: 'string',
    //   description: 'Node ID to attach comment to (optional)',
    //   required: false,
    //   visibility: 'user-or-llm',
    // },
  },
  request: {
    url: (params) => `https://api.figma.com/v1/files/${params.fileKey}/comments`,
    method: 'POST',
    headers: () => ({
      'X-Figma-Token': process.env.FIGMA_API_KEY || '',
      'Content-Type': 'application/json',
    }),
    body: (params) => {
      const body: any = {
        message: params.message,
        client_meta: {
          x: Number(100),
          y: Number(200),
        },
      }
      logger.info('body', body)
      return body
    },
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

    return {
      success: true,
      output: {
        content: `Successfully posted comment to Figma file`,
        metadata: {
          id: data.id,
          file_key: data.file_key,
          parent_id: data.parent_id,
          user: data.user,
          created_at: data.created_at,
          resolved_at: data.resolved_at,
          message: data.message,
          client_meta: data.client_meta,
          order_id: data.order_id,
        },
      },
    }
  },
  outputs: {
    content: {
      type: 'string',
      description: 'Comment creation result',
    },
    metadata: {
      type: 'object',
      description: 'Created comment metadata',
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
}

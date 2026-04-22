import type { ToolConfig } from '@/tools/types'
import type { UnipileCommentPostParams, UnipileCommentPostToolResponse } from '@/tools/unipile/types'

export const unipileCommentPostTool: ToolConfig<UnipileCommentPostParams, UnipileCommentPostToolResponse> =
  {
    id: 'unipile_comment_post',
    name: 'Unipile Comment on Post',
    description:
      'Adds a comment on a post (`POST /api/v1/posts/{post_id}/comments` as form data). Uses server `UNIPILE_API_KEY`.',
    version: '1.0.0',

    params: {
      post_id: {
        type: 'string',
        required: true,
        visibility: 'user-or-llm',
        description: 'Unipile post id',
      },
      account_id: {
        type: 'string',
        required: true,
        visibility: 'user-or-llm',
        description: 'Unipile connected account id',
      },
      text: {
        type: 'string',
        required: true,
        visibility: 'user-or-llm',
        description: 'Comment text',
      },
      name: {
        type: 'string',
        required: false,
        visibility: 'user-or-llm',
        description: 'Optional name form field',
      },
      profile_id: {
        type: 'string',
        required: false,
        visibility: 'user-or-llm',
        description: 'Optional profile_id form field',
      },
      is_company: {
        type: 'string',
        required: false,
        visibility: 'user-or-llm',
        description: 'Optional is_company form field (e.g. true/false string)',
      },
      external_link: {
        type: 'string',
        required: false,
        visibility: 'user-or-llm',
        description: 'Optional external_link form field',
      },
      as_organization: {
        type: 'string',
        required: false,
        visibility: 'user-or-llm',
        description: 'Optional as_organization form field',
      },
      comment_id: {
        type: 'string',
        required: false,
        visibility: 'user-or-llm',
        description: 'Optional parent comment id (reply)',
      },
      attachments: {
        type: 'string',
        required: false,
        visibility: 'user-or-llm',
        description: 'Optional attachments form field',
      },
    },

    request: {
      url: '/api/tools/unipile/comment-post',
      method: 'POST',
      headers: () => ({ 'Content-Type': 'application/json' }),
      body: (params) => ({
        post_id: params.post_id?.trim(),
        account_id: params.account_id?.trim(),
        text: params.text,
        name: params.name,
        profile_id: params.profile_id,
        is_company: params.is_company,
        external_link: params.external_link,
        as_organization: params.as_organization,
        comment_id: params.comment_id,
        attachments: params.attachments,
      }),
    },

    transformResponse: async (response: Response) => {
      const data = (await response.json()) as Record<string, unknown>
      if (!response.ok) {
        throw new Error(typeof data.error === 'string' ? data.error : 'Unipile request failed')
      }

      return {
        success: true,
        output: {
          object: typeof data.object === 'string' ? data.object : null,
          comment_id: typeof data.comment_id === 'string' ? data.comment_id : null,
        },
      }
    },

    outputs: {
      object: { type: 'string', description: 'Unipile object type (e.g. CommentSent)', optional: true },
      comment_id: { type: 'string', description: 'Created comment id', optional: true },
    },
  }

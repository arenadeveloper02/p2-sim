import type { ToolConfig } from '@/tools/types'
import type {
  UnipileCommentPostParams,
  UnipileCommentPostToolResponse,
} from '@/tools/unipile/types'

export const unipileCommentPostTool: ToolConfig<
  UnipileCommentPostParams,
  UnipileCommentPostToolResponse
> = {
  id: 'unipile_comment_post',
  name: 'Unipile Comment a post',
  description:
    'Comments on a post or replies to a comment (`POST /api/v1/posts/{post_id}/comments`, multipart). LinkedIn: `post_id` is the post social_id; optional `mentions` is a JSON array of { name, profile_id, is_company? } for `{{n}}` placeholders in text (the Unipile block uses a mention table to build this). See https://developer.unipile.com/docs/posts-and-comments Uses server UNIPILE_API_KEY.',
  version: '1.0.0',

  params: {
    post_id: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description:
        'Post id path param. LinkedIn: social_id from the post object. Instagram: provider_id (not post short code).',
    },
    account_id: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Unipile account id (multipart field)',
    },
    text: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description:
        'Comment body (1–1250 chars). LinkedIn: insert {{0}}, {{1}}, … matching indexes in the mentions JSON array.',
    },
    mentions: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Optional LinkedIn JSON array: [{ "name": "…", "profile_id": "…", "is_company": true }]. Usually produced from the workflow block mention table.',
    },
    name: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Legacy: single-mention display name (prefer `mentions` JSON or block table)',
    },
    profile_id: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Legacy: single-mention profile_id',
    },
    is_company: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Legacy: true/false with name+profile_id',
    },
    external_link: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'LinkedIn only: https URL for link preview; URL should also appear in text.',
    },
    as_organization: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'LinkedIn only: organization id to comment as that org.',
    },
    comment_id: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional: reply to this comment. LinkedIn: id from the comments list.',
    },
    attachments: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'LinkedIn: integration-specific attachment field (e.g. one image; max resolution per Unipile docs).',
    },
  },

  request: {
    url: '/api/tools/unipile/comment-post',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => {
      const out: Record<string, unknown> = {
        post_id: params.post_id?.trim(),
        account_id: params.account_id?.trim(),
        text: params.text,
      }
      if (typeof params.mentions === 'string' && params.mentions.trim() !== '') {
        out.mentions = params.mentions.trim()
      }
      if (typeof params.name === 'string' && params.name.trim() !== '') {
        out.name = params.name.trim()
      }
      if (typeof params.profile_id === 'string' && params.profile_id.trim() !== '') {
        out.profile_id = params.profile_id.trim()
      }
      if (params.is_company === 'true' || params.is_company === 'false') {
        out.is_company = params.is_company
      }
      if (typeof params.external_link === 'string' && params.external_link.trim() !== '') {
        out.external_link = params.external_link.trim()
      }
      if (typeof params.as_organization === 'string' && params.as_organization.trim() !== '') {
        out.as_organization = params.as_organization.trim()
      }
      if (typeof params.comment_id === 'string' && params.comment_id.trim() !== '') {
        out.comment_id = params.comment_id.trim()
      }
      if (typeof params.attachments === 'string' && params.attachments.trim() !== '') {
        out.attachments = params.attachments.trim()
      }
      return out
    },
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
    object: {
      type: 'string',
      description: 'Unipile object type (e.g. CommentSent)',
      optional: true,
    },
    comment_id: { type: 'string', description: 'Created comment id', optional: true },
  },
}

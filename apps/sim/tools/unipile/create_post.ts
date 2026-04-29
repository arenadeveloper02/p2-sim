import type { ToolConfig } from '@/tools/types'
import type { UnipileCreatePostParams, UnipileCreatePostToolResponse } from '@/tools/unipile/types'

export const unipileCreatePostTool: ToolConfig<
  UnipileCreatePostParams,
  UnipileCreatePostToolResponse
> = {
  id: 'unipile_create_post',
  name: 'Unipile Create Post',
  description:
    'Creates a LinkedIn post (`POST /api/v1/posts` multipart). Uses server `UNIPILE_API_KEY`.',
  version: '1.0.0',

  params: {
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
      description: 'Post body text',
    },
    attachments: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Attachments form field',
    },
    video_thumbnail: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Video thumbnail form field',
    },
    repost: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Repost form field',
    },
    include_job_posting: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'include_job_posting form field',
    },
    name: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Display name form field',
    },
    profile_id: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'profile_id form field',
    },
    is_company: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: "is_company form field (e.g. 'true' / 'false')",
    },
    external_link: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'external_link form field',
    },
    as_organization: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'as_organization form field',
    },
    location: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'location form field',
    },
  },

  request: {
    url: '/api/tools/unipile/create-post',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      account_id: params.account_id?.trim(),
      text: params.text,
      attachments: params.attachments,
      video_thumbnail: params.video_thumbnail,
      repost: params.repost,
      include_job_posting: params.include_job_posting,
      name: params.name,
      profile_id: params.profile_id,
      is_company: params.is_company,
      external_link: params.external_link,
      as_organization: params.as_organization,
      location: params.location,
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
        post_id: typeof data.post_id === 'string' ? data.post_id : null,
      },
    }
  },

  outputs: {
    object: {
      type: 'string',
      description: 'Unipile object type (e.g. PostCreated)',
      optional: true,
    },
    post_id: { type: 'string', description: 'Created post id', optional: true },
  },
}

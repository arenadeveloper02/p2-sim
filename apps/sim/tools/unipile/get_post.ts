import type { ToolConfig } from '@/tools/types'
import type { UnipileGetPostParams, UnipileGetPostToolResponse } from '@/tools/unipile/types'

export const unipileGetPostTool: ToolConfig<UnipileGetPostParams, UnipileGetPostToolResponse> = {
  id: 'unipile_get_post',
  name: 'Unipile Get Post',
  description:
    'Retrieves a single post (`GET /api/v1/posts/{post_id}`). Uses server `UNIPILE_API_KEY`.',
  version: '1.0.0',

  params: {
    post_id: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Unipile post id',
    },
  },

  request: {
    url: '/api/tools/unipile/get-post',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      post_id: params.post_id?.trim(),
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
        id: typeof data.id === 'string' ? data.id : null,
        text: typeof data.text === 'string' ? data.text : null,
        share_url: typeof data.share_url === 'string' ? data.share_url : null,
        post: data,
      },
    }
  },

  outputs: {
    object: { type: 'string', description: 'Discriminator when present', optional: true },
    id: { type: 'string', description: 'Post id', optional: true },
    text: { type: 'string', description: 'Post text', optional: true },
    share_url: { type: 'string', description: 'Share URL', optional: true },
    post: { type: 'json', description: 'Full post payload' },
  },
}

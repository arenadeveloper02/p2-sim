import type { ToolConfig } from '@/tools/types'
import type {
  UnipileGetUserProfileParams,
  UnipileGetUserProfileToolResponse,
} from '@/tools/unipile/types'

export const unipileGetUserProfileTool: ToolConfig<
  UnipileGetUserProfileParams,
  UnipileGetUserProfileToolResponse
> = {
  id: 'unipile_get_user_profile',
  name: 'Unipile Get User Profile',
  description:
    'Retrieves a user profile (`GET /api/v1/users/{identifier}`). Uses server `UNIPILE_API_KEY`.',
  version: '1.0.0',

  params: {
    user_identifier: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'User identifier (Unipile path segment)',
    },
  },

  request: {
    url: '/api/tools/unipile/get-user-profile',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      user_identifier: params.user_identifier?.trim(),
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
        provider: typeof data.provider === 'string' ? data.provider : null,
        public_identifier:
          typeof data.public_identifier === 'string' ? data.public_identifier : null,
        first_name: typeof data.first_name === 'string' ? data.first_name : null,
        last_name: typeof data.last_name === 'string' ? data.last_name : null,
        headline: typeof data.headline === 'string' ? data.headline : null,
        public_profile_url:
          typeof data.public_profile_url === 'string' ? data.public_profile_url : null,
        profile: data,
      },
    }
  },

  outputs: {
    object: {
      type: 'string',
      description: 'Unipile object type (e.g. UserProfile)',
      optional: true,
    },
    provider: { type: 'string', description: 'Provider id', optional: true },
    public_identifier: { type: 'string', description: 'Public slug', optional: true },
    first_name: { type: 'string', description: 'First name', optional: true },
    last_name: { type: 'string', description: 'Last name', optional: true },
    headline: { type: 'string', description: 'Headline', optional: true },
    public_profile_url: { type: 'string', description: 'Public profile URL', optional: true },
    profile: { type: 'json', description: 'Full user profile payload' },
  },
}

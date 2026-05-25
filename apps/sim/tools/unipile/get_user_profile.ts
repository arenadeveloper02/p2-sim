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
  name: 'Unipile Retrieve a profile',
  description:
    'Retrieves a user profile (`GET /api/v1/users/{identifier}`). Required: `account_id`, `user_identifier` (path). Optional LinkedIn queries: `linkedin_sections` (JSON array string—avoid `*` for high volume; see throttling), `linkedin_api` (recruiter | sales_navigator), `notify` (boolean; profile visit notification). Consult provider limits: https://developer.unipile.com/docs/provider-limits-and-restrictions Uses server `UNIPILE_API_KEY`.',
  version: '1.0.0',

  params: {
    account_id: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Unipile account id (required query parameter)',
    },
    user_identifier: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description:
        'Path `{identifier}`: provider internal id or public id (e.g. LinkedIn public slug)',
    },
    linkedin_sections_json: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description:
        'Optional JSON array of LinkedIn profile section names for Unipile `linkedin_sections` (e.g. `["experience_preview","skills"]`). Prefer preview or targeted sections; `*` is heavy and easy to throttle.',
    },
    linkedin_api: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional `linkedin_api` query: recruiter | sales_navigator (when subscribed)',
    },
    notify: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description: 'Optional `notify` query: whether the profile visit is notified to the viewee',
    },
  },

  request: {
    url: '/api/tools/unipile/get-user-profile',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => {
      const out: Record<string, unknown> = {
        account_id:
          typeof params.account_id === 'string' ? params.account_id.trim() : params.account_id,
        user_identifier:
          typeof params.user_identifier === 'string'
            ? params.user_identifier.trim()
            : params.user_identifier,
      }
      if (
        typeof params.linkedin_sections_json === 'string' &&
        params.linkedin_sections_json.trim() !== ''
      ) {
        out.linkedin_sections_json = params.linkedin_sections_json.trim()
      }
      const api = params.linkedin_api
      if (api === 'recruiter' || api === 'sales_navigator') {
        out.linkedin_api = api
      }
      if (params.notify === true || params.notify === false) {
        out.notify = params.notify
      }
      return out
    },
  },

  transformResponse: async (response: Response) => {
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      throw new Error(typeof data.error === 'string' ? data.error : 'Unipile request failed')
    }

    const throttled = data.throttled_sections
    const throttled_sections = Array.isArray(throttled)
      ? throttled.filter((x): x is string => typeof x === 'string')
      : null

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
        throttled_sections: throttled_sections?.length ? throttled_sections : null,
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
    throttled_sections: {
      type: 'json',
      description:
        'When LinkedIn throttles section payloads, Unipile lists affected section names (if any)',
      optional: true,
    },
    profile: { type: 'json', description: 'Full user profile payload' },
  },
}

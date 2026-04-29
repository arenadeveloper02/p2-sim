import type { ToolConfig } from '@/tools/types'
import type {
  UnipileRetrieveCompanyDetailsParams,
  UnipileRetrieveCompanyDetailsToolResponse,
} from '@/tools/unipile/types'

export const unipileRetrieveCompanyDetailsTool: ToolConfig<
  UnipileRetrieveCompanyDetailsParams,
  UnipileRetrieveCompanyDetailsToolResponse
> = {
  id: 'unipile_retrieve_company_details',
  name: 'Unipile Retrieve LinkedIn Company Profile',
  description:
    'Fetches a LinkedIn company profile via Unipile (`GET /api/v1/linkedin/company/{identifier}?account_id=…`). Uses `UNIPILE_API_KEY` from the server environment.',
  version: '1.0.0',

  params: {
    identifier: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'LinkedIn company public identifier (URL path segment, e.g. position2)',
    },
    account_id: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Unipile connected account id (`account_id` query parameter)',
    },
  },

  request: {
    url: '/api/tools/unipile/retrieve-company-details',
    method: 'POST',
    headers: () => ({ 'Content-Type': 'application/json' }),
    body: (params) => ({
      identifier: params.identifier?.trim(),
      account_id: params.account_id?.trim(),
    }),
  },

  transformResponse: async (response: Response) => {
    const data = (await response.json()) as Record<string, unknown>
    if (!response.ok) {
      const err = typeof data.error === 'string' ? data.error : 'Unipile request failed'
      throw new Error(err)
    }

    return {
      success: true,
      output: {
        object: typeof data.object === 'string' ? data.object : null,
        id: typeof data.id === 'string' ? data.id : null,
        name: typeof data.name === 'string' ? data.name : null,
        description: typeof data.description === 'string' ? data.description : null,
        public_identifier:
          typeof data.public_identifier === 'string' ? data.public_identifier : null,
        profile_url: typeof data.profile_url === 'string' ? data.profile_url : null,
        followers_count: typeof data.followers_count === 'number' ? data.followers_count : null,
        employee_count: typeof data.employee_count === 'number' ? data.employee_count : null,
        website: typeof data.website === 'string' ? data.website : null,
        logo: typeof data.logo === 'string' ? data.logo : null,
        profile: data,
      },
    }
  },

  outputs: {
    object: {
      type: 'string',
      description: 'Unipile object type (e.g. CompanyProfile)',
      optional: true,
    },
    id: { type: 'string', description: 'Company id', optional: true },
    name: { type: 'string', description: 'Company name', optional: true },
    description: { type: 'string', description: 'Company description', optional: true },
    public_identifier: { type: 'string', description: 'LinkedIn public slug', optional: true },
    profile_url: { type: 'string', description: 'LinkedIn profile URL', optional: true },
    followers_count: { type: 'number', description: 'Follower count', optional: true },
    employee_count: { type: 'number', description: 'Employee count', optional: true },
    website: { type: 'string', description: 'Company website', optional: true },
    logo: { type: 'string', description: 'Logo URL', optional: true },
    profile: { type: 'json', description: 'Full CompanyProfile payload from Unipile' },
  },
}

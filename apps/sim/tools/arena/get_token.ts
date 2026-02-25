import type { ArenaGetTokenParams, ArenaGetTokenResponse } from '@/tools/arena/types'
import type { ToolConfig } from '@/tools/types'

export const getToken: ToolConfig<ArenaGetTokenParams, ArenaGetTokenResponse> = {
  id: 'arena_get_token',
  name: 'Arena Get Token',
  description:
    'Get Arena token for the logged-in user or workflow owner. Both must have @position2.com email.',
  version: '1.0.0',

  params: {
    operation: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Operation to perform (get_token)',
    },
  },

  request: {
    url: (params: ArenaGetTokenParams) => {
      const c = params._context
      const userId = c?.sessionUserId ?? c?.workflowUserId
      const userEmail = c?.userEmail
      if (!userId)
        throw new Error(
          'Missing required field: userId (from logged-in user or workflow owner in execution context)'
        )
      const url = `/api/tools/arena/get-token?userId=${encodeURIComponent(userId)}`
      if (userEmail) {
        return `${url}&email=${encodeURIComponent(userEmail)}`
      }
      return url
    },
    method: 'GET',
    headers: () => ({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }),
  },

  transformResponse: async (
    response: Response,
    _params?: ArenaGetTokenParams
  ): Promise<ArenaGetTokenResponse> => {
    const data = await response.json()
    if (!response.ok) {
      return {
        success: false,
        output: {
          success: false,
          found: data.found ?? false,
          reason: data.reason ?? 'Request failed',
        },
      }
    }
    return {
      success: true,
      output: {
        success: true,
        found: data.found,
        userId: data.userId,
        email: data.email,
        arenaToken: data.arenaToken,
      },
    }
  },

  outputs: {
    success: { type: 'boolean', description: 'Whether the request succeeded' },
    found: { type: 'boolean', description: 'Whether a token was found for the user' },
    userId: { type: 'string', description: 'User id (when found)' },
    email: { type: 'string', description: 'User email (when found)' },
    arenaToken: { type: 'string', description: 'Arena token for the user (when found)' },
    reason: { type: 'string', description: 'Error or failure reason (when not found)' },
  },
}

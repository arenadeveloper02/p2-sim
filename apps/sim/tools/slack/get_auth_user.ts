import type { SlackGetAuthUserParams, SlackGetAuthUserResponse } from '@/tools/slack/types'
import type { ToolConfig } from '@/tools/types'

/**
 * Slack `auth.test` wrapper.
 *
 * Returns identity information about the *token owner* — i.e. who the
 * `accessToken` / `botToken` belongs to — without requiring the caller to know
 * any user ID. Works with both bot tokens (xoxb-) and user tokens (xoxp-).
 *
 * Slack docs: https://api.slack.com/methods/auth.test
 */
export const slackGetAuthUserTool: ToolConfig<SlackGetAuthUserParams, SlackGetAuthUserResponse> = {
  id: 'slack_get_auth_user',
  name: 'Slack Get Auth User',
  description:
    'Identify the token owner via Slack auth.test. Returns the user ID, username, team, team ID, and workspace URL of whoever the token belongs to. No user ID input required.',
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'slack',
  },

  params: {
    authMethod: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Authentication method: oauth or bot_token',
    },
    botToken: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Bot token for Custom Bot',
    },
    accessToken: {
      type: 'string',
      required: false,
      visibility: 'hidden',
      description: 'OAuth access token or bot token for Slack API',
    },
  },

  request: {
    url: () => 'https://slack.com/api/auth.test',
    method: 'POST',
    headers: (params: SlackGetAuthUserParams) => ({
      // auth.test accepts the token in the Authorization header; an empty body
      // POST is the documented form-encoded call shape.
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Bearer ${params.accessToken || params.botToken}`,
    }),
  },

  transformResponse: async (response: Response) => {
    const data = await response.json()

    if (!data.ok) {
      if (data.error === 'invalid_auth' || data.error === 'token_revoked') {
        throw new Error('Invalid or revoked Slack token. Please reconnect your Slack account.')
      }
      if (data.error === 'account_inactive') {
        throw new Error('Slack account is inactive (workspace may have been deleted).')
      }
      throw new Error(data.error || 'Failed to identify token owner via auth.test')
    }

    return {
      success: true,
      output: {
        userId: data.user_id || '',
        user: data.user || '',
        teamId: data.team_id || '',
        team: data.team || '',
        url: data.url || '',
        botId: data.bot_id || '',
        appId: data.app_id || '',
        isEnterpriseInstall: Boolean(data.is_enterprise_install),
        enterpriseId: data.enterprise_id || '',
      },
    }
  },

  outputs: {
    userId: {
      type: 'string',
      description: 'Slack user ID of the token owner (e.g., U1234567890)',
    },
    user: {
      type: 'string',
      description: 'Username (handle) of the token owner',
    },
    teamId: {
      type: 'string',
      description: 'Slack workspace/team ID (e.g., T0123456789)',
    },
    team: {
      type: 'string',
      description: 'Slack workspace/team name',
    },
    url: {
      type: 'string',
      description: 'Workspace URL (e.g., https://acme.slack.com/)',
    },
    botId: {
      type: 'string',
      description: 'Bot user ID — present when the token is a bot token (xoxb-)',
    },
    appId: {
      type: 'string',
      description: 'Slack app ID associated with the token, when applicable',
    },
    isEnterpriseInstall: {
      type: 'boolean',
      description: 'Whether the token belongs to an Enterprise Grid org-level install',
    },
    enterpriseId: {
      type: 'string',
      description: 'Enterprise Grid org ID, when isEnterpriseInstall is true',
    },
  },
}

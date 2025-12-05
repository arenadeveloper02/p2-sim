import { NextResponse } from 'next/server'
import { authorizeCredentialUse } from '@/lib/auth/credential-access'
import { generateRequestId } from '@/lib/core/utils/request'
import { createLogger } from '@/lib/logs/console/logger'
import { refreshAccessTokenIfNeeded } from '@/app/api/auth/oauth/utils'

export const dynamic = 'force-dynamic'

const logger = createLogger('SlackUsersAPI')

interface SlackUser {
  id: string
  name: string
  real_name: string
  profile: {
    display_name: string
    real_name: string
  }
  is_bot: boolean
  deleted: boolean
}

export async function POST(request: Request) {
  try {
    const requestId = generateRequestId()
    const body = await request.json()
    const { credential, workflowId } = body

    if (!credential) {
      logger.error('Missing credential in request')
      return NextResponse.json({ error: 'Credential is required' }, { status: 400 })
    }

    let accessToken: string
    let isBotToken = false

    if (credential.startsWith('xoxb-')) {
      accessToken = credential
      isBotToken = true
      logger.info('Using direct bot token for Slack API')
    } else {
      const authz = await authorizeCredentialUse(request as any, {
        credentialId: credential,
        workflowId,
      })
      if (!authz.ok || !authz.credentialOwnerUserId) {
        return NextResponse.json({ error: authz.error || 'Unauthorized' }, { status: 403 })
      }
      const resolvedToken = await refreshAccessTokenIfNeeded(
        credential,
        authz.credentialOwnerUserId,
        requestId
      )
      if (!resolvedToken) {
        logger.error('Failed to get access token', {
          credentialId: credential,
          userId: authz.credentialOwnerUserId,
        })
        return NextResponse.json(
          {
            error: 'Could not retrieve access token',
            authRequired: true,
          },
          { status: 401 }
        )
      }
      accessToken = resolvedToken
    }

    let data
    try {
      data = await fetchSlackUsers(accessToken)
      logger.info('Successfully fetched Slack users')
    } catch (error) {
      logger.error('Slack API error:', error)
      return NextResponse.json(
        { error: `Slack API error: ${(error as Error).message}` },
        { status: 400 }
      )
    }

    // Filter to active users and format the response
    const users = (data.members || [])
      .filter((user: SlackUser) => !user.deleted && !user.is_bot)
      .map((user: SlackUser) => ({
        id: user.id,
        name: user.name,
        realName:
          user.real_name || user.profile?.real_name || user.profile?.display_name || user.name,
        displayName:
          user.profile?.display_name || user.profile?.real_name || user.real_name || user.name,
      }))

    logger.info(`Successfully fetched ${users.length} Slack users`, {
      total: data.members?.length || 0,
      active: users.length,
      tokenType: isBotToken ? 'bot' : 'oauth',
    })

    return NextResponse.json({ users })
  } catch (error) {
    logger.error('Error in Slack users API:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: (error as Error).message },
      { status: 500 }
    )
  }
}

async function fetchSlackUsers(accessToken: string) {
  const url = new URL('https://slack.com/api/users.list')
  url.searchParams.append('limit', '1000')

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    throw new Error(`Slack API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  if (!data.ok) {
    throw new Error(data.error || 'Failed to fetch users')
  }

  return data
}

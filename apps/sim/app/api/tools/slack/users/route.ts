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
    const isBotToken = credential.startsWith('xoxb-')

    if (isBotToken) {
      accessToken = credential
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
      logger.info('Using OAuth token for Slack API')
    }

    const data = await fetchSlackUsers(accessToken)

    const users = (data.members || [])
      .filter((user: SlackUser) => !user.deleted && !user.is_bot)
      .map((user: SlackUser) => ({
        id: user.id,
        name: user.name,
        real_name: user.real_name || user.name,
        displayName:
          user.profile?.display_name || user.profile?.real_name || user.real_name || user.name,
      }))

    logger.info(`Successfully fetched ${users.length} Slack users`, {
      total: data.members?.length || 0,
      active: users.length,
      tokenType: isBotToken ? 'bot_token' : 'oauth',
    })
    return NextResponse.json({ users })
  } catch (error) {
    logger.error('Error processing Slack users request:', error)
    return NextResponse.json(
      { error: 'Failed to retrieve Slack users', details: (error as Error).message },
      { status: 500 }
    )
  }
}

async function fetchSlackUsers(accessToken: string) {
  const allMembers: SlackUser[] = []
  let cursor: string | undefined = undefined
  const limit = 200

  do {
    const url = new URL('https://slack.com/api/users.list')
    url.searchParams.append('limit', String(limit))
    if (cursor) {
      url.searchParams.append('cursor', cursor)
    }

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

    // Accumulate members from this page
    if (data.members && Array.isArray(data.members)) {
      allMembers.push(...data.members)
    }

    // Check if there are more pages
    cursor = data.response_metadata?.next_cursor
    if (cursor && cursor.trim() === '') {
      cursor = undefined
    }

    logger.info(`Fetched ${data.members?.length || 0} users (total so far: ${allMembers.length})`, {
      hasMore: !!cursor,
    })
  } while (cursor)

  logger.info(`Completed fetching all Slack users: ${allMembers.length} total`)

  // Return data in the same format as before, but with all members
  return {
    ok: true,
    members: allMembers,
  }
}

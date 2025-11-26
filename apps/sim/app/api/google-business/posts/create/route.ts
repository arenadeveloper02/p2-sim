import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createLogger } from '@/lib/logs/console/logger'
import { getOAuthToken, getUserId } from '@/app/api/auth/oauth/utils'
import { createGBPPost } from '../../gbp-api'
import type { GBPPostRequest } from '../../types'

const logger = createLogger('GBP-Posts-Create')

/**
 * POST /api/google-business/posts/create
 * Create a Google Business Profile post
 */
export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID()

  try {
    // Parse request body first to check for workflowId
    const body = (await request.json()) as GBPPostRequest & { workflowId?: string }

    // Get the authenticated user - support both browser sessions and workflow execution
    let userId: string | undefined

    if (body.workflowId) {
      // Workflow execution - get user from workflow
      userId = await getUserId(requestId, body.workflowId)
      logger.info(`[${requestId}] Workflow execution`, { workflowId: body.workflowId, userId })
    } else {
      // Browser session
      const session = await getSession()
      userId = session?.user?.id
      logger.info(`[${requestId}] Browser session`, { userId })
    }

    if (!userId) {
      logger.warn(`[${requestId}] Unauthenticated request`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Validate required fields
    if (!body.accountId || !body.locationId || !body.summary || !body.topicType) {
      logger.warn(`[${requestId}] Missing required fields`, { body })
      return NextResponse.json(
        {
          error: 'Missing required fields: accountId, locationId, summary, topicType',
        },
        { status: 400 }
      )
    }

    logger.info(`[${requestId}] Creating GBP post`, {
      userId,
      accountId: body.accountId,
      locationId: body.locationId,
      topicType: body.topicType,
    })

    // Get OAuth access token for google-business provider
    const accessToken = await getOAuthToken(userId, 'google-business')

    if (!accessToken) {
      logger.error(`[${requestId}] No OAuth token found for user`, { userId })
      return NextResponse.json(
        {
          error:
            'Google Business Profile not connected. Please connect your account in settings.',
        },
        { status: 403 }
      )
    }

    // Create the post via GBP API
    const result = await createGBPPost(accessToken, body)

    if (!result.success) {
      logger.error(`[${requestId}] Failed to create GBP post`, {
        error: result.error,
        details: result.details,
      })
      return NextResponse.json(
        {
          error: result.error || 'Failed to create post',
          details: result.details,
        },
        { status: 500 }
      )
    }

    logger.info(`[${requestId}] GBP post created successfully`, {
      postId: result.postId,
      userId,
    })

    return NextResponse.json({
      success: true,
      postId: result.postId,
      name: result.name,
      details: result.details,
    })
  } catch (error) {
    logger.error(`[${requestId}] Error in GBP post creation`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    })

    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

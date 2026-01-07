import { createLogger } from '@sim/logger'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkHybridAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'

export const dynamic = 'force-dynamic'

const logger = createLogger('SlackSearchAllAPI')

const SlackSearchAllSchema = z.object({
  accessToken: z.string().min(1, 'Access token is required'),
  query: z.string().min(1, 'Query is required'),
  highlight: z.boolean().optional().nullable(),
  page: z.coerce.number().int().min(1).optional().nullable(),
  sort: z
    .enum(['score', 'timestamp'])
    .optional()
    .nullable(),
  sort_dir: z
    .enum(['asc', 'desc'])
    .optional()
    .nullable(),
})

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const authResult = await checkHybridAuth(request, { requireWorkflowId: false })

    if (!authResult.success) {
      logger.warn(`[${requestId}] Unauthorized Slack search.all attempt: ${authResult.error}`)
      return NextResponse.json(
        {
          success: false,
          error: authResult.error || 'Authentication required',
        },
        { status: 401 }
      )
    }

    logger.info(`[${requestId}] Authenticated Slack search.all request via ${authResult.authType}`, {
      userId: authResult.userId,
    })

    const body = await request.json()
    const validatedData = SlackSearchAllSchema.parse(body)

    const token = validatedData.accessToken.trim()

    if (!token) {
      logger.warn(`[${requestId}] Missing Slack access token for search.all`)
      return NextResponse.json(
        {
          success: false,
          error: 'Slack access token is required. Provide accessToken in the request body.',
        },
        { status: 400 }
      )
    }

    // Build form-encoded body for Slack API
    const formData = new URLSearchParams()
    formData.append('query', validatedData.query)

    if (typeof validatedData.highlight === 'boolean') {
      formData.append('highlight', String(validatedData.highlight))
    }

    if (validatedData.page != null) {
      formData.append('page', String(validatedData.page))
    }

    if (validatedData.sort) {
      formData.append('sort', validatedData.sort)
    }

    if (validatedData.sort_dir) {
      formData.append('sort_dir', validatedData.sort_dir)
    }

    logger.info(`[${requestId}] Executing Slack search.all`, {
      query: validatedData.query,
      queryLength: validatedData.query.length,
      hasChannel: validatedData.query.includes('in:'),
      hasHighlight: typeof validatedData.highlight === 'boolean',
      page: validatedData.page,
      sort: validatedData.sort,
      sort_dir: validatedData.sort_dir,
    })

    const slackResponse = await fetch('https://slack.com/api/search.all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${token}`,
      },
      body: formData.toString(),
    })

    const data = await slackResponse.json()

    if (!slackResponse.ok || !data.ok) {
      logger.error(`[${requestId}] Slack search.all API error`, {
        status: slackResponse.status,
        statusText: slackResponse.statusText,
        error: data.error,
      })

      return NextResponse.json(
        {
          success: false,
          error: data.error || `Slack API error: ${slackResponse.status} ${slackResponse.statusText}`,
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        output: {
          query: validatedData.query, // Return the query we sent, not Slack's processed version
          files: data.files,
          messages: data.messages,
          posts: data.posts,
          raw: data,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    logger.error(`[${requestId}] Unexpected error in Slack search.all`, {
      error,
    })

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error while searching Slack',
      },
      { status: 500 }
    )
  }
}



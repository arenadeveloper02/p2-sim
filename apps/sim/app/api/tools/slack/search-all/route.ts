import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { generateRequestId } from '@/lib/core/utils/request'

const logger = createLogger('SlackSearchAllAPI')

const SlackSearchAllSchema = z.object({
  accessToken: z.string(),
  query: z.string(),
  count: z.number().min(1).max(100).default(50),
  page: z.number().min(1).default(1),
  sort: z.enum(['timestamp', 'score', 'relevance']).default('timestamp'),
  sort_dir: z.enum(['asc', 'desc']).default('desc'),
  highlight: z.boolean().default(true),
})

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const body = await request.json()
    const validatedData = SlackSearchAllSchema.parse(body)

    const { accessToken, query, count, page, sort, sort_dir, highlight } = validatedData

    logger.info(`[${requestId}] Starting Slack search`, {
      query: query.substring(0, 50),
      count,
      page,
    })

    // Check if bot token is being used instead of user token
    if (accessToken.startsWith('xoxb-')) {
      logger.error(`[${requestId}] Bot token provided instead of user token for search.all`, {
        tokenPrefix: accessToken.substring(0, 10),
      })
      return NextResponse.json(
        {
          success: false,
          error:
            'This search operation requires a user token, but a bot token was provided. Please re-authenticate your Slack account to enable search functionality. Go to Settings > Integrations > Slack and click "Reconnect" to grant user token permissions.',
        },
        { status: 403 }
      )
    }

    // Make request to Slack API
    const searchResponse = await fetch('https://slack.com/api/search.all', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Bearer ${accessToken}`,
      },
      body: new URLSearchParams({
        query,
        count: count.toString(),
        page: page.toString(),
        sort,
        sort_dir,
        highlight: highlight.toString(),
      }),
    })

    if (!searchResponse.ok) {
      const errorData = await searchResponse.json().catch(() => ({}))
      logger.error(`[${requestId}] Slack API error`, {
        status: searchResponse.status,
        error: errorData,
      })
      return NextResponse.json(
        {
          success: false,
          error: errorData.error || 'Failed to search Slack',
        },
        { status: searchResponse.status }
      )
    }

    const searchData = await searchResponse.json()

    if (!searchData.ok) {
      logger.error(`[${requestId}] Slack search failed`, {
        error: searchData.error,
      })
      return NextResponse.json(
        {
          success: false,
          error: searchData.error || 'Search failed',
        },
        { status: 400 }
      )
    }

    logger.info(`[${requestId}] Search completed successfully`, {
      totalMessages: searchData.messages?.total || 0,
      totalFiles: searchData.files?.total || 0,
    })

    return NextResponse.json({
      success: true,
      output: {
        ok: searchData.ok,
        query: query,
        messages: {
          total: searchData.messages?.total || 0,
          matches: searchData.messages?.matches || [],
          pagination: searchData.messages?.pagination,
          paging: searchData.messages?.paging,
        },
        files: {
          total: searchData.files?.total || 0,
          matches: searchData.files?.matches || [],
        },
      },
    })
  } catch (error) {
    logger.error(`[${requestId}] Unexpected error in Slack search`, {
      error: error instanceof Error ? error.message : String(error),
    })

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid request data',
          details: error.errors,
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    )
  }
}

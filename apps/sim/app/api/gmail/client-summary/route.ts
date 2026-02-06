import { randomUUID } from 'crypto'
import { db, sql } from '@sim/db'
import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'
import { generateRequestId } from '@/lib/core/utils/request'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const logger = createLogger('GmailClientSummaryAPI')

const ThreadedEmailSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string(),
    threadId: z.string(),
    subject: z.string(),
    from: z.string(),
    to: z.string(),
    date: z.string(),
    content: z.string(),
    attachments: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          size: z.number(),
          type: z.string(),
          url: z.string().nullable(),
          key: z.string().nullable(),
          context: z.string().nullable(),
          content: z.string().nullable(),
        })
      )
      .optional(),
    replies: z.array(ThreadedEmailSchema).optional(),
  })
)

const PayloadSchema = z.object({
  clientId: z.string().optional(),
  clientName: z.string().optional(),
  clientDomain: z.string().optional(),
  type: z.string().optional(),
  oneDayEmails: z.array(ThreadedEmailSchema).optional(),
  oneWeekEmails: z.array(ThreadedEmailSchema).optional(),
})

function formatPgTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '')
}

/**
 * GET - Retrieves gmail client summary data for a specific client ID.
 */
export async function GET(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const url = new URL(request.url)
    const clientId = url.searchParams.get('cid')
    const summaryType = url.searchParams.get('type')

    if (!clientId) {
      return NextResponse.json(
        { success: false, error: { message: 'cid parameter is required' } },
        { status: 400 }
      )
    }

    if (!summaryType) {
      return NextResponse.json(
        { success: false, error: { message: 'type parameter is required' } },
        { status: 400 }
      )
    }

    logger.info(`[${requestId}] Fetching latest gmail summaries for client`, {
      clientId,
      type: summaryType,
    })

    // Get the most recent run_date for this client
    const latestDateResult = await db.execute(sql`
      SELECT run_date
      FROM gmail_client_summary
      WHERE (client_id = ${clientId} OR client_name = ${clientId} OR client_domain = ${clientId})
        AND type = ${summaryType}
      ORDER BY run_date DESC
      LIMIT 1
    `)

    // Debug logging to see result structure
    logger.info(`[${requestId}] Latest date result:`, latestDateResult)

    // Handle different result structures
    const rows = Array.isArray(latestDateResult)
      ? latestDateResult
      : (latestDateResult as any).rows || []

    if (rows.length === 0) {
      return NextResponse.json(
        {
          success: true,
          data: {
            client_id: clientId,
            message: 'No gmail summary data found for this client and type',
            summaries: [],
          },
        },
        { status: 200 }
      )
    }

    const latestRunDate = String(rows[0].run_date)

    // Get all summaries for this client on the latest run_date
    const summariesResult = await db.execute(sql`
      SELECT
        id,
        client_id,
        client_name,
        client_domain,
        type,
        one_day_summary,
        seven_day_summary,
        run_date,
        status,
        run_start_time,
        run_end_time
      FROM gmail_client_summary
      WHERE (client_id = ${clientId} OR client_name = ${clientId} OR client_domain = ${clientId})
        AND type = ${summaryType}
        AND run_date = ${latestRunDate}
      ORDER BY run_start_time DESC
    `)

    const summaries = Array.isArray(summariesResult)
      ? summariesResult
      : (summariesResult as any).rows || []

    logger.info(`[${requestId}] Found gmail summaries for client`, {
      clientId,
      runDate: latestRunDate,
      recordCount: summaries.length,
    })

    return NextResponse.json(
      {
        success: true,
        data: {
          client_id: clientId,
          run_date: latestRunDate,
          total_records: summaries.length,
          summaries: summaries,
          summary: {
            total_records: summaries.length,
            has_one_day_summary: summaries.some((s: any) => s.one_day_summary),
            has_seven_day_summary: summaries.some((s: any) => s.seven_day_summary),
          },
        },
      },
      { status: 200 }
    )
  } catch (error: any) {
    logger.error(`[${requestId}] Error fetching gmail summaries`, {
      error: error.message || String(error),
      errorCode: error.code,
    })

    return NextResponse.json(
      {
        success: false,
        error: { message: error.message || 'Failed to fetch gmail summaries' },
      },
      { status: 500 }
    )
  }
}

/**
 * POST - Accepts a single threaded email results, summarizes it, and stores it in gmail_client_summary.
 */
export async function POST(req: NextRequest) {
  const requestId = generateRequestId()
  const runStart = new Date()

  try {
    const body = await req.json()
    logger.info(`[${requestId}] Received request body keys:`, Object.keys(body))

    const parseResult = PayloadSchema.safeParse(body)

    const { clientId, clientName, clientDomain, type, oneDayEmails, oneWeekEmails } =
      parseResult.data || {}

    logger.info(`[${requestId}] Client ID:`, clientId)
    logger.info(`[${requestId}] Client Name:`, clientName)
    logger.info(`[${requestId}] Client Domain:`, clientDomain)
    logger.info(`[${requestId}] Summary Type:`, type)
    logger.info(`[${requestId}] One Day Emails:`, oneDayEmails)
    logger.info(`[${requestId}] One Week Emails:`, oneWeekEmails)

    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      logger.error(`[${requestId}] OpenAI API key not configured`)
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }
    const openai = new OpenAI({ apiKey: openaiApiKey })

    const id = randomUUID()
    const runDate = runStart.toISOString().split('T')[0]

    await db.execute(sql`
      INSERT INTO gmail_client_summary (
        id, run_date, status, run_start_time, client_id, client_name, client_domain, type
      ) VALUES (
        ${id},
        ${runDate},
        'RUNNING',
        ${formatPgTimestamp(runStart)},
        ${clientId || null},
        ${clientName || null},
        ${clientDomain || null},
        ${type || null}
      )
    `)

    let oneDaySummary = null
    let sevenDaysSummary = null

    if (oneDayEmails && oneDayEmails.length >= 0) {
      const userPrompt = `Summarise this email thread (provided as JSON):\n\n${JSON.stringify(oneDayEmails, null, 2)}`
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are an excellent Email Summariser. The email object has replies which are also email objects.',
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 1200,
      })

      oneDaySummary = completion.choices[0]?.message?.content || ''
    }

    if (oneWeekEmails && oneWeekEmails.length >= 0) {
      const userPrompt = `Summarise this email thread (provided as JSON):\n\n${JSON.stringify(oneWeekEmails, null, 2)}`
      const sevenDaysCompletion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'You are an excellent Email Summariser. The email object has replies which are also email objects.',
          },
          {
            role: 'user',
            content: userPrompt,
          },
        ],
        temperature: 0.2,
        max_tokens: 1200,
      })
      sevenDaysSummary = sevenDaysCompletion.choices[0]?.message?.content || ''
    }

    const runEnd = new Date()

    await db.execute(sql`
      UPDATE gmail_client_summary
      SET
        status = 'COMPLETED',
        run_end_time = ${formatPgTimestamp(runEnd)},
        type = ${type || null},
        one_day_summary = ${oneDaySummary || null},
        seven_day_summary = ${sevenDaysSummary || null}
      WHERE id = ${id}
    `)

    return NextResponse.json({
      success: true,
      id,
      oneDaySummary,
      sevenDaysSummary,
    })
  } catch (error: any) {
    logger.error(`[${requestId}] Failed to summarize/store gmail client summary`, error)
    return NextResponse.json(
      {
        error: 'Failed to summarize/store gmail client summary',
        message: error?.message ?? 'Unknown',
      },
      { status: 500 }
    )
  }
}

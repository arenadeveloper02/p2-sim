import { randomUUID } from 'crypto'
import { db } from '@sim/db'
import { createLogger } from '@sim/logger'
import { sql } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import { z } from 'zod'
import { generateRequestId } from '@/lib/core/utils/request'

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
  clientName: z.string().optional(),
  clientDomain: z.string().optional(),
  oneDayEmails: z.array(ThreadedEmailSchema).optional(),
  oneWeekEmails: z.array(ThreadedEmailSchema).optional(),
})

function formatPgTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '')
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

    const { clientName, clientDomain, oneDayEmails, oneWeekEmails } = parseResult.data || {}

    logger.info(`[${requestId}] Client Name:`, clientName)
    logger.info(`[${requestId}] Client Domain:`, clientDomain)
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
        id, run_date, status, run_start_time, client_name, client_domain
      ) VALUES (
        ${id},
        ${runDate},
        'RUNNING',
        ${formatPgTimestamp(runStart)},
        ${clientName || null},
        ${clientDomain || null}
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

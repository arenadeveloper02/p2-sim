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
  query: z.string().optional(),
  results: z.array(ThreadedEmailSchema),
})

function formatPgTimestamp(date: Date): string {
  return date.toISOString().replace('T', ' ').replace('Z', '')
}

function extractClientDomain(query?: string): string | null {
  if (!query) return null
  const emailRegex = /[\w.-]+@([\w.-]+\.[\w.-]+)/gi
  const matches = query.match(emailRegex)
  if (matches && matches.length > 0) {
    const domainMatch = matches[0].match(/@([\w.-]+\.[\w.-]+)/i)
    return domainMatch?.[1] ?? null
  }
  return null
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
    if (!parseResult.success) {
      logger.error(`[${requestId}] Validation error:`, parseResult.error.format())
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: parseResult.error.format(),
          message:
            'Request body must include: results (required), clientName (optional), query (optional)',
        },
        { status: 400 }
      )
    }

    const { clientName, query, results } = parseResult.data

    if (!results || results.length === 0) {
      logger.error(`[${requestId}] Empty results array`)
      return NextResponse.json({ error: 'Results array cannot be empty' }, { status: 400 })
    }

    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      logger.error(`[${requestId}] OpenAI API key not configured`)
      return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 500 })
    }

    const id = randomUUID()
    const runDate = runStart.toISOString().split('T')[0]
    const clientDomain = extractClientDomain(query)

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

    const userPrompt = `Summarise this email thread (provided as JSON):\n\n${JSON.stringify(results, null, 2)}`

    const openai = new OpenAI({ apiKey: openaiApiKey })
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

    logger.info('User Prompt:', userPrompt)

    const summary = completion.choices[0]?.message?.content || ''
    const runEnd = new Date()

    await db.execute(sql`
      UPDATE gmail_client_summary
      SET
        status = 'COMPLETED',
        run_end_time = ${formatPgTimestamp(runEnd)},
        one_day_summary = ${summary || null}
      WHERE id = ${id}
    `)

    return NextResponse.json({
      success: true,
      id,
      summary,
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

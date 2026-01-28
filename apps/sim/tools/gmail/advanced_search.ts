import { createLogger } from '@sim/logger'
import type { ExecutionContext } from '@/lib/uploads/contexts/execution/utils'
import type {
  GmailAdvancedSearchParams,
  GmailAdvancedSearchResponse,
  ThreadedEmailMessage,
} from '@/tools/gmail/types'
import { extractAttachmentInfo, GMAIL_API_BASE } from '@/tools/gmail/utils'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('GmailAdvancedSearchTool')

/**
 * Extracts client domain from search query if email is present
 */
function extractClientDomain(query: string): string | null {
  // Match email pattern in query
  const emailRegex = /[\w.-]+@([\w.-]+\.[\w.-]+)/gi
  const matches = query.match(emailRegex)
  if (matches && matches.length > 0) {
    // Extract domain from first email found
    const domainMatch = matches[0].match(/@([\w.-]+\.[\w.-]+)/i)
    if (domainMatch?.[1]) {
      return domainMatch[1]
    }
  }
  return null
}

/**
 * Formats a JS Date into a Postgres-friendly timestamp string (no timezone suffix).
 */
function formatPgTimestamp(date: Date): string {
  // Convert to ISO, then drop timezone to fit `timestamp` (without time zone) columns
  // Example: 2026-01-28T06:34:47.742Z -> 2026-01-28 06:34:47.742
  return date.toISOString().replace('T', ' ').replace('Z', '')
}

/**
 * Generates OpenAI summary for email results
 */
async function generateEmailSummary(results: ThreadedEmailMessage[]): Promise<string> {
  try {
    // Only run on server side
    if (typeof window !== 'undefined') {
      logger.warn('OpenAI summarization skipped on client side')
      return ''
    }

    // Dynamic import to avoid client-side bundling
    const OpenAI = (await import('openai')).default
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      logger.warn('OpenAI API key not configured, skipping summarization')
      return ''
    }

    if (results.length === 0) {
      return ''
    }

    // Combine all emails into a single prompt
    const emailsText = results
      .map(
        (email, index) =>
          `Email ${index + 1}:\nSubject: ${email.subject}\nFrom: ${email.from}\nTo: ${email.to}\nDate: ${email.date}\n\nContent:\n${email.content.substring(0, 1000)}\n\n---\n`
      )
      .join('\n')

    const OpenAIClass = (await import('openai')).default
    const openai = new OpenAIClass({ apiKey: openaiApiKey })
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content:
            'You are an excellent Email Summariser. Provide a concise summary of the key points from these emails.',
        },
        {
          role: 'user',
          content: `Summarise these emails -\n\n${emailsText}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 1000,
    })

    return completion.choices[0]?.message?.content || ''
  } catch (error: any) {
    logger.error('Error generating email summary:', error)
    return ''
  }
}

/**
 * Decodes base64url encoded string to UTF-8
 */
function decodeBase64Url(data: string): string {
  try {
    // Replace base64url characters with standard base64
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/')
    const buffer = Buffer.from(base64, 'base64')
    return buffer.toString('utf-8')
  } catch (error) {
    logger.warn('Failed to decode base64url data:', error)
    return ''
  }
}

/**
 * Extracts text content from message payload
 * Falls back to HTML if plain text is not available
 */
function extractMessageContent(payload: any): string {
  let plainTextContent = ''
  let htmlContent = ''

  // Check main body first
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data)
  }

  // Search through parts for text/plain and text/html
  if (payload.parts && Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.body?.data) {
        if (part.mimeType === 'text/plain' && !plainTextContent) {
          plainTextContent = decodeBase64Url(part.body.data)
        } else if (part.mimeType === 'text/html' && !htmlContent) {
          htmlContent = decodeBase64Url(part.body.data)
        }
      }

      // Check nested parts
      if (part.parts && Array.isArray(part.parts)) {
        for (const nestedPart of part.parts) {
          if (nestedPart.body?.data) {
            if (nestedPart.mimeType === 'text/plain' && !plainTextContent) {
              plainTextContent = decodeBase64Url(nestedPart.body.data)
            } else if (nestedPart.mimeType === 'text/html' && !htmlContent) {
              htmlContent = decodeBase64Url(nestedPart.body.data)
            }
          }
        }
      }
    }
  }

  // Return plain text if available, otherwise fall back to HTML
  return plainTextContent || htmlContent || ''
}

/**
 * Downloads and parses attachment content using file parsers (similar to Google Drive search)
 */
async function downloadAndParseAttachment(
  messageId: string,
  attachmentId: string,
  filename: string,
  mimeType: string,
  accessToken: string
): Promise<Buffer> {
  try {
    const attachmentResponse = await fetch(
      `${GMAIL_API_BASE}/messages/${messageId}/attachments/${attachmentId}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    )

    if (!attachmentResponse.ok) {
      throw new Error(`Failed to download attachment ${attachmentId}`)
    }

    const attachmentData = (await attachmentResponse.json()) as { data: string; size: number }

    // Decode base64url data to buffer
    const base64 = attachmentData.data.replace(/-/g, '+').replace(/_/g, '/')
    return Buffer.from(base64, 'base64')
  } catch (error) {
    logger.error(`Error downloading attachment ${attachmentId}:`, error)
    throw error
  }
}

/**
 * Extracts content from attachment using file parsers (similar to Google Drive search)
 */
async function extractAttachmentContent(
  buffer: Buffer,
  filename: string,
  mimeType: string
): Promise<string | null> {
  // Only attempt to parse files on the server side
  if (typeof window !== 'undefined') {
    logger.warn('File parsing skipped on client side', { filename, mimeType })
    return null
  }

  // Get file extension from filename
  let extension: string | null = null
  if (filename) {
    const lastDot = filename.lastIndexOf('.')
    if (lastDot !== -1) {
      extension = filename.slice(lastDot + 1).toLowerCase()
    }
  }

  // For text-based files, extract content directly
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/json' ||
    mimeType === 'application/xml' ||
    mimeType === 'application/javascript' ||
    mimeType === 'application/x-javascript'
  ) {
    try {
      const content = buffer.toString('utf-8')
      return content
    } catch (error) {
      logger.warn('Failed to read file as UTF-8 text', { filename, mimeType, error })
    }
  }

  // For binary files (PDF, DOCX, etc.), try to use file parsers
  if (extension) {
    try {
      // Use a runtime string to prevent Next.js from statically analyzing
      const fileParsersModulePath = '@' + '/lib/file-parsers'
      const fileParsersModule = await import(fileParsersModulePath)

      if (fileParsersModule.isSupportedFileType(extension)) {
        logger.info('Parsing attachment with specialized parser', {
          filename,
          extension,
          mimeType,
        })
        const parseResult = await fileParsersModule.parseBuffer(buffer, extension)
        return parseResult.content
      }
    } catch (parseError) {
      logger.warn('File parser not available or failed', {
        filename,
        mimeType,
        extension,
        error: parseError,
      })
    }
  }

  return null
}

/**
 * Processes a single message and its attachments
 */
async function processMessage(
  message: any,
  accessToken: string,
  includeAttachments: boolean,
  execContext: ExecutionContext | undefined
): Promise<Omit<ThreadedEmailMessage, 'replies'>> {
  const headers = message.payload?.headers || []
  const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || ''
  const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || ''
  const to = headers.find((h: any) => h.name.toLowerCase() === 'to')?.value || ''
  const date = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || ''

  // Extract email content with fallback to HTML
  const content = extractMessageContent(message.payload)

  // Process attachments if requested
  const attachments: any[] = []
  if (includeAttachments && message.payload) {
    const attachmentInfo = extractAttachmentInfo(message.payload)
    if (attachmentInfo.length > 0) {
      for (const attachment of attachmentInfo) {
        try {
          // Download attachment
          const buffer = await downloadAndParseAttachment(
            message.id,
            attachment.attachmentId,
            attachment.filename,
            attachment.mimeType,
            accessToken
          )

          // Extract content from attachment
          const attachmentContent = await extractAttachmentContent(
            buffer,
            attachment.filename,
            attachment.mimeType
          )

          // Upload attachment to S3/execution storage if we have execution context
          let userFile: any = null
          if (execContext && typeof window === 'undefined') {
            try {
              // Dynamic import to avoid client-side bundling of server-only modules
              const { uploadExecutionFile } = await import(
                '@/lib/uploads/contexts/execution/execution-file-manager'
              )
              userFile = await uploadExecutionFile(
                execContext,
                buffer,
                attachment.filename,
                attachment.mimeType
              )
            } catch (uploadError) {
              logger.warn('Failed to upload attachment to execution storage', {
                filename: attachment.filename,
                error: uploadError,
              })
            }
          }

          attachments.push({
            id: userFile?.id || attachment.attachmentId,
            name: attachment.filename,
            size: attachment.size,
            type: attachment.mimeType,
            url: userFile?.url || null,
            key: userFile?.key || null,
            context: userFile?.context || null,
            content: attachmentContent || null,
          })
        } catch (error: any) {
          logger.error(`Error processing attachment ${attachment.filename}:`, error)
          // Continue with other attachments
        }
      }
    }
  }

  return {
    id: message.id,
    threadId: message.threadId,
    subject,
    from,
    to,
    date,
    content: content || '',
    attachments: attachments.length > 0 ? attachments : undefined,
  }
}

/**
 * Builds threaded message structure from flat array of messages
 * First message (index 0) is parent, rest are replies
 */
async function buildThreadedStructure(
  messages: any[],
  accessToken: string,
  includeAttachments: boolean,
  execContext: ExecutionContext | undefined
): Promise<ThreadedEmailMessage | null> {
  if (!messages || messages.length === 0) {
    return null
  }

  // Process parent message (first message)
  const parentMessage = messages[0]
  const parentData = await processMessage(
    parentMessage,
    accessToken,
    includeAttachments,
    execContext
  )

  // Process reply messages if any
  const replies: ThreadedEmailMessage[] = []
  for (let i = 1; i < messages.length; i++) {
    const replyData = await processMessage(
      messages[i],
      accessToken,
      includeAttachments,
      execContext
    )
    replies.push({
      ...replyData,
      replies: undefined,
    })
  }

  return {
    ...parentData,
    replies: replies.length > 0 ? replies : undefined,
  }
}

export const gmailAdvancedSearchTool: ToolConfig<
  GmailAdvancedSearchParams,
  GmailAdvancedSearchResponse
> = {
  id: 'gmail_advanced_search',
  name: 'Gmail Advanced Search',
  description:
    'Search emails in Gmail with full content and attachment parsing, returning threaded conversations',
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'google-email',
  },

  params: {
    accessToken: {
      type: 'string',
      required: true,
      visibility: 'hidden',
      description: 'Access token for Gmail API',
    },
    query: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Search query for emails',
    },
    maxResults: {
      type: 'number',
      required: false,
      visibility: 'user-only',
      description: 'Maximum number of results to return (default: 5)',
    },
    includeAttachments: {
      type: 'boolean',
      required: false,
      visibility: 'user-only',
      description: 'Include and parse attachments (default: false)',
    },
    clientName: {
      type: 'string',
      required: false,
      visibility: 'user-only',
      description: 'Client name for tracking and summarization',
    },
  },

  // Request config is required but not used when directExecution is provided
  request: {
    url: '/api/tools/gmail/advanced_search',
    method: 'GET',
    headers: () => ({}),
  },

  directExecution: async (params: GmailAdvancedSearchParams) => {
    const { query, accessToken, maxResults = 5, includeAttachments = false, clientName } = params

    // Extract client domain from query
    const clientDomain = extractClientDomain(query)

    // Create database record for tracking (server-side only)
    let summaryRecordId: string | null = null
    const runStartTime = new Date()
    const runStartTimePg = formatPgTimestamp(runStartTime)
    // Format date as YYYY-MM-DD for PostgreSQL DATE type
    const runDate = runStartTime.toISOString().split('T')[0]

    // Always create a tracking row for advanced search runs (even if clientName/domain are empty)
    if (typeof window === 'undefined') {
      try {
        // Dynamic imports to avoid client-side bundling
        const { db } = await import('@sim/db')
        const { sql } = await import('drizzle-orm')
        const { randomUUID } = await import('crypto')

        summaryRecordId = randomUUID()

        logger.info('Attempting to insert summary tracking record', {
          summaryRecordId,
          clientName,
          clientDomain,
          runDate,
          runStartTime: runStartTime.toISOString(),
        })

        await db.execute(sql`
          INSERT INTO gmail_client_summary (
            id, run_date, status, run_start_time, client_name, client_domain
          ) VALUES (
            ${summaryRecordId},
            ${runDate},
            'RUNNING',
            ${runStartTimePg},
            ${clientName || null},
            ${clientDomain || null}
          )
        `)

        logger.info(`Successfully created summary tracking record: ${summaryRecordId}`)
      } catch (error: any) {
        // Try to pull useful Postgres error details (postgres-js / Drizzle sometimes wraps the real error)
        const pgError = error?.cause || error
        logger.error('Failed to create summary tracking record', {
          message: error?.message,
          name: error?.name,
          stack: error?.stack,
          pgMessage: pgError?.message,
          pgCode: pgError?.code,
          pgDetail: pgError?.detail,
          pgHint: pgError?.hint,
          pgSchema: pgError?.schema,
          pgTable: pgError?.table,
          pgColumn: pgError?.column,
          pgConstraint: pgError?.constraint,
          clientName,
          clientDomain,
        })

        try {
          const { db } = await import('@sim/db')
          const { sql } = await import('drizzle-orm')

          const probe = await db.execute(sql`
            SELECT
              current_database() as db,
              current_schema() as schema,
              to_regclass('public.gmail_client_summary') as public_table,
              to_regclass('gmail_client_summary') as search_path_table
          `)
          logger.error('DB probe after gmail_client_summary insert failure', {
            probe: (probe as any)?.rows ?? probe,
          })
        } catch (probeError: any) {
          logger.error('DB probe failed after gmail_client_summary insert failure', {
            message: probeError?.message,
            name: probeError?.name,
            stack: probeError?.stack,
          })
        }
        // Continue execution even if database insert fails
      }
    } else {
      logger.debug('Skipping database insert', {
        isServerSide: typeof window === 'undefined',
      })
    }

    // Search for messages
    const searchParams = new URLSearchParams()
    searchParams.append('q', query)
    searchParams.append('maxResults', maxResults.toString())

    const searchResponse = await fetch(`${GMAIL_API_BASE}/messages?${searchParams.toString()}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    if (!searchResponse.ok) {
      const errorData = await searchResponse.json().catch(() => ({}))
      logger.error('Failed to search Gmail messages', {
        status: searchResponse.status,
        error: errorData,
      })
      throw new Error(errorData.error?.message || 'Failed to search Gmail messages')
    }

    const data = await searchResponse.json()

    if (!data.messages || data.messages.length === 0) {
      return {
        success: true,
        output: {
          results: [],
        },
      }
    }

    const messagesToProcess = data.messages.slice(0, maxResults)

    try {
      // Get unique thread IDs from search results to avoid duplicate API calls
      const uniqueThreadIds = new Set<string>()
      messagesToProcess.forEach((msg: any) => {
        if (msg.threadId) {
          uniqueThreadIds.add(msg.threadId)
        }
      })

      logger.info(
        `Found ${uniqueThreadIds.size} unique threads from ${messagesToProcess.length} search results`
      )

      // Fetch full thread details for each unique thread ID
      const threadPromises = Array.from(uniqueThreadIds).map(async (threadId: string) => {
        try {
          const threadResponse = await fetch(`${GMAIL_API_BASE}/threads/${threadId}?format=full`, {
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
          })

          if (!threadResponse.ok) {
            const errorData = await threadResponse.json().catch(() => ({}))
            logger.error(`Failed to fetch thread ${threadId}`, {
              status: threadResponse.status,
              statusText: threadResponse.statusText,
              error: errorData,
            })
            return null
          }

          const threadData = await threadResponse.json()
          return {
            threadId,
            messages: threadData.messages || [],
          }
        } catch (error: any) {
          logger.error(`Error fetching thread ${threadId}:`, error)
          return null
        }
      })

      const threads = (await Promise.all(threadPromises)).filter((t) => t !== null)

      // Get execution context if available
      const execContext = (params as any)._executionContext as ExecutionContext | undefined

      // Build threaded structure for each thread
      const processedResults: ThreadedEmailMessage[] = []

      if (threads.length > 0) {
        // Process threads successfully fetched
        for (const thread of threads) {
          const threadedMessage = await buildThreadedStructure(
            thread.messages,
            accessToken,
            includeAttachments,
            execContext
          )
          if (threadedMessage) {
            processedResults.push(threadedMessage)
          }
        }
      } else {
        // Fallback: If thread API fails, fetch individual messages
        logger.warn('Thread API calls failed, falling back to individual message fetching')
        const messagePromises = messagesToProcess.map(async (msg: any) => {
          try {
            const messageResponse = await fetch(
              `${GMAIL_API_BASE}/messages/${msg.id}?format=full`,
              {
                headers: {
                  Authorization: `Bearer ${accessToken}`,
                  'Content-Type': 'application/json',
                },
              }
            )

            if (!messageResponse.ok) {
              logger.warn(`Failed to fetch message ${msg.id}`)
              return null
            }

            const messageData = await messageResponse.json()
            return await processMessage(messageData, accessToken, includeAttachments, execContext)
          } catch (error: any) {
            logger.error(`Error fetching message ${msg.id}:`, error)
            return null
          }
        })

        const individualMessages = (await Promise.all(messagePromises)).filter((m) => m !== null)
        for (const msg of individualMessages) {
          processedResults.push({
            ...msg,
            replies: undefined,
          })
        }
      }

      logger.info(`Returning ${processedResults.length} email results`)

      // Generate summary using OpenAI if we have results
      let oneDaySummary = ''
      if (processedResults.length > 0 && summaryRecordId) {
        try {
          oneDaySummary = await generateEmailSummary(processedResults)
          logger.info('Generated email summary', { summaryLength: oneDaySummary.length })
        } catch (error: any) {
          logger.error('Failed to generate email summary:', error)
        }
      }

      // Update database record with results (server-side only)
      const runEndTime = new Date()
      const runEndTimePg = formatPgTimestamp(runEndTime)
      if (summaryRecordId && typeof window === 'undefined') {
        try {
          // Dynamic imports to avoid client-side bundling
          const { db } = await import('@sim/db')
          const { sql } = await import('drizzle-orm')

          const status = processedResults.length > 0 ? 'COMPLETED' : 'FAILED'

          logger.info('Updating summary tracking record', {
            summaryRecordId,
            status,
            resultCount: processedResults.length,
            summaryLength: oneDaySummary.length,
          })

          await db.execute(sql`
            UPDATE gmail_client_summary
            SET 
              status = ${status},
              run_end_time = ${runEndTimePg},
              one_day_summary = ${oneDaySummary || null}
            WHERE id = ${summaryRecordId}
          `)

          logger.info(`Successfully updated summary tracking record: ${summaryRecordId}`)
        } catch (error: any) {
          logger.error('Failed to update summary tracking record', {
            error: error.message,
            stack: error.stack,
            summaryRecordId,
          })
        }
      }

      return {
        success: true,
        output: {
          results: processedResults,
        },
      }
    } catch (error: any) {
      logger.error('Error processing advanced search results:', error)

      // Update database record with FAILED status (server-side only)
      const runEndTime = new Date()
      const runEndTimePg = formatPgTimestamp(runEndTime)
      if (summaryRecordId && typeof window === 'undefined') {
        try {
          // Dynamic imports to avoid client-side bundling
          const { db } = await import('@sim/db')
          const { sql } = await import('drizzle-orm')

          logger.info('Updating summary tracking record to FAILED', {
            summaryRecordId,
            error: error.message,
          })

          await db.execute(sql`
            UPDATE gmail_client_summary
            SET 
              status = 'FAILED',
              run_end_time = ${runEndTimePg}
            WHERE id = ${summaryRecordId}
          `)

          logger.info(`Successfully updated summary tracking record to FAILED: ${summaryRecordId}`)
        } catch (dbError: any) {
          logger.error('Failed to update summary tracking record on error', {
            error: dbError.message,
            stack: dbError.stack,
            summaryRecordId,
          })
        }
      }

      return {
        success: false,
        output: {
          results: [],
        },
        error: error.message || 'Failed to process search results',
      }
    }
  },

  outputs: {
    results: {
      type: 'json',
      description:
        'Array of email search results with threaded conversations. Each result includes id, threadId, subject, from, to, date, content, attachments (if includeAttachments is true), and replies array containing all reply messages in the same structure.',
    },
  },
}

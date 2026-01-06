import { createLogger } from '@sim/logger'
import type { ExecutionContext } from '@/lib/uploads/contexts/execution/utils'
import type { GmailAdvancedSearchParams, GmailAdvancedSearchResponse } from '@/tools/gmail/types'
import { extractAttachmentInfo, extractMessageBody, GMAIL_API_BASE } from '@/tools/gmail/utils'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('GmailAdvancedSearchTool')

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
    const base64Data = attachmentData.data.replace(/-/g, '+').replace(/_/g, '/')
    const buffer = Buffer.from(base64Data, 'base64')

    return buffer
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

export const gmailAdvancedSearchTool: ToolConfig<
  GmailAdvancedSearchParams,
  GmailAdvancedSearchResponse
> = {
  id: 'gmail_advanced_search',
  name: 'Gmail Advanced Search',
  description: 'Search emails in Gmail with full content and attachment parsing',
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
  },

  // Request config is required but not used when directExecution is provided
  request: {
    url: '/api/tools/gmail/advanced_search',
    method: 'GET',
    headers: () => ({}),
  },

  directExecution: async (params: GmailAdvancedSearchParams) => {
    const { query, accessToken, maxResults = 5, includeAttachments = false } = params

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
      // Fetch full message details for each result
      const messagePromises = messagesToProcess.map(async (msg: any) => {
        const messageResponse = await fetch(`${GMAIL_API_BASE}/messages/${msg.id}?format=full`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        })

        if (!messageResponse.ok) {
          throw new Error(`Failed to fetch details for message ${msg.id}`)
        }

        return await messageResponse.json()
      })

      const messages = await Promise.all(messagePromises)

      // Process each message
      const processedResults = await Promise.all(
        messages.map(async (message: any) => {
          const headers = message.payload?.headers || []
          const subject = headers.find((h: any) => h.name.toLowerCase() === 'subject')?.value || ''
          const from = headers.find((h: any) => h.name.toLowerCase() === 'from')?.value || ''
          const to = headers.find((h: any) => h.name.toLowerCase() === 'to')?.value || ''
          const date = headers.find((h: any) => h.name.toLowerCase() === 'date')?.value || ''

          // Extract email content
          const content = extractMessageBody(message.payload)

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
                  // Use dynamic import to avoid client-side bundling issues
                  let userFile: any = null
                  const execContext = (params as any)._executionContext as
                    | ExecutionContext
                    | undefined
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
        })
      )

      return {
        success: true,
        output: {
          results: processedResults,
        },
      }
    } catch (error: any) {
      logger.error('Error processing advanced search results:', error)
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
        'Array of email search results with full content and parsed attachments. Each result includes id, threadId, subject, from, to, date, content, and attachments (if includeAttachments is true).',
    },
  },
}

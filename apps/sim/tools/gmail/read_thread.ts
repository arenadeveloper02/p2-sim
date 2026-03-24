import { createLogger } from '@sim/logger'
import type { GmailReadThreadParams, GmailToolResponse } from '@/tools/gmail/types'
import { extractMessageBody, GMAIL_API_BASE } from '@/tools/gmail/utils'
import type { ToolConfig } from '@/tools/types'

const logger = createLogger('GmailReadThreadTool')

export const gmailReadThreadTool: ToolConfig<GmailReadThreadParams, GmailToolResponse> = {
  id: 'gmail_read_thread',
  name: 'Gmail Read Thread',
  description: 'Read all emails in a Gmail thread by thread ID',
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
    threadId: {
      type: 'string',
      required: true,
      visibility: 'user-only',
      description: 'Gmail thread ID',
    },
  },
  request: {
    url: (params) => `${GMAIL_API_BASE}/threads/${params.threadId}?format=full`,
    method: 'GET',
    headers: (params) => ({
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    }),
  },
  transformResponse: async (response) => {
    const data = await response.json()
    const messages = Array.isArray(data?.messages) ? data.messages : []

    if (messages.length === 0) {
      return {
        success: true,
        output: {
          content: 'No messages found in this thread.',
          metadata: {
            id: '',
            threadId: data?.id || '',
            labelIds: [],
          },
        },
      }
    }

    try {
      const threadMessages = messages.map((message: any) => {
        const headers = message?.payload?.headers || []
        const subject = headers.find((h: any) => h.name?.toLowerCase() === 'subject')?.value || ''
        const from = headers.find((h: any) => h.name?.toLowerCase() === 'from')?.value || ''
        const to = headers.find((h: any) => h.name?.toLowerCase() === 'to')?.value || ''
        const date = headers.find((h: any) => h.name?.toLowerCase() === 'date')?.value || ''
        const content = extractMessageBody(message?.payload || {})

        return {
          id: message?.id || '',
          threadId: message?.threadId || data?.id || '',
          subject,
          from,
          to,
          date,
          content: content || message?.snippet || '',
        }
      })

      const latestMessage = threadMessages[threadMessages.length - 1]
      return {
        success: true,
        output: {
          content: `Found ${threadMessages.length} messages in thread ${data.id}.`,
          metadata: {
            id: latestMessage.id,
            threadId: data.id,
            labelIds: [],
            from: latestMessage.from,
            to: latestMessage.to,
            subject: latestMessage.subject,
            date: latestMessage.date,
            result: threadMessages,
          },
        },
      }
    } catch (error: any) {
      logger.error('Error processing thread messages:', error)
      return {
        success: true,
        output: {
          content: `Thread found but parsing failed: ${error?.message || 'Unknown error'}`,
          metadata: {
            id: '',
            threadId: data?.id || '',
            labelIds: [],
          },
        },
      }
    }
  },
  outputs: {
    content: { type: 'string', description: 'Thread summary with messages and replies' },
    metadata: { type: 'json', description: 'Thread metadata' },
  },
}

export const gmailReadThreadV2Tool: ToolConfig<GmailReadThreadParams, GmailToolResponse> = {
  id: 'gmail_read_thread_v2',
  name: 'Gmail Read Thread',
  description: 'Read all emails in a Gmail thread by thread ID',
  version: '2.0.0',
  oauth: gmailReadThreadTool.oauth,
  params: gmailReadThreadTool.params,
  request: gmailReadThreadTool.request,
  transformResponse: async (response: Response) => {
    return await gmailReadThreadTool.transformResponse!(response)
  },
  outputs: gmailReadThreadTool.outputs,
}

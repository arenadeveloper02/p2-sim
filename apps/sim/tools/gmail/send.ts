import { createLogger } from '@/lib/logs/console/logger'
import type { GmailSendParams, GmailToolResponse } from '@/tools/gmail/types'
import { GMAIL_API_BASE } from '@/tools/gmail/utils'
import type { ToolConfig } from '@/tools/types'
import { extractContentFromAgentResponse, renderAgentResponseToString } from './markUpRenderUtil'

const logger = createLogger('GmailSendTool')

export const gmailSendTool: ToolConfig<GmailSendParams, GmailToolResponse> = {
  id: 'gmail_send',
  name: 'Gmail Send',
  description: 'Send emails using Gmail',
  version: '1.0.0',

  oauth: {
    required: true,
    provider: 'google-email',
    additionalScopes: ['https://www.googleapis.com/auth/gmail.send'],
  },

  params: {
    accessToken: {
      type: 'string',
      required: true,
      visibility: 'hidden',
      description: 'Access token for Gmail API',
    },
    to: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Recipient email address',
    },
    subject: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Email subject',
    },
    body: {
      type: 'string',
      required: true,
      visibility: 'user-or-llm',
      description: 'Email body content',
    },
    isHtml: {
      type: 'boolean',
      required: false,
      visibility: 'user-or-llm',
      description: 'Is the email body HTML?',
    },
    cc: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'CC recipients (comma-separated)',
    },
    bcc: {
      type: 'string',
      required: false,
      visibility: 'user-or-llm',
      description: 'BCC recipients (comma-separated)',
    },
  },

  request: {
    url: () => `${GMAIL_API_BASE}/messages/send`,
    method: 'POST',
    headers: (params: GmailSendParams) => ({
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    }),
    body: (params: GmailSendParams): Record<string, any> => {
      const emailHeaders = ['MIME-Version: 1.0', `To: ${params.to}`]
      if (params.isHtml) {
        emailHeaders.push('Content-Type: text/html; charset="UTF-8"')
        let emailHtml: string
        if (!params.body || typeof params.body !== 'string') {
          logger.error('Invalid content provided for email.')
          logger.error('params.body', params.body)
          emailHtml = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: Arial, sans-serif; margin: 0 auto; padding: 20px;">
              <h1>Error: Invalid content</h1>
              <p>No valid content was provided for the email.</p>
            </body>
            </html>
          `
        } else {
          try {
            logger.info('Rendering agent response to HTML...')
            const rawContent = extractContentFromAgentResponse(params.body)
            logger.info('Raw content:', rawContent)
            emailHtml = renderAgentResponseToString(rawContent)
            logger.info('Rendered HTML:', emailHtml)
          } catch (error) {
            console.error('HTML rendering failed:', error)
            emailHtml = `
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: Arial, sans-serif; margin: 0 auto; padding: 20px;">
                <h1>Error: Could not process content</h1>
                <p>The AI-generated content could not be formatted. Raw response:</p>
                <pre style="background: #f4f4f4; padding: 15px; border-radius: 8px;">${params.body}</pre>
              </body>
              </html>
            `
          }
        }
        logger.info('Final Email HTML:', emailHtml)
        emailHeaders.push(`Subject: ${params.subject}`, '', emailHtml)
      } else {
        emailHeaders.push('Content-Type: text/plain; charset="UTF-8"')
        emailHeaders.push(`Subject: ${params.subject}`, '', params.body)
      }

      if (params.cc) {
        emailHeaders.push(`Cc: ${params.cc}`)
      }
      if (params.bcc) {
        emailHeaders.push(`Bcc: ${params.bcc}`)
      }

      const email = emailHeaders.join('\n')

      return {
        raw: Buffer.from(email).toString('base64url'),
      }
    },
  },

  transformResponse: async (response) => {
    const data = await response.json()

    return {
      success: true,
      output: {
        content: 'Email sent successfully',
        metadata: {
          id: data.id,
          threadId: data.threadId,
          labelIds: data.labelIds,
        },
      },
    }
  },

  outputs: {
    content: { type: 'string', description: 'Success message' },
    metadata: {
      type: 'object',
      description: 'Email metadata',
      properties: {
        id: { type: 'string', description: 'Gmail message ID' },
        threadId: { type: 'string', description: 'Gmail thread ID' },
        labelIds: { type: 'array', items: { type: 'string' }, description: 'Email labels' },
      },
    },
  },
}

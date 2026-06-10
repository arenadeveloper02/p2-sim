import { createLogger } from '@sim/logger'
import { env } from '@/lib/core/config/env'
import type { MailProvider, ProcessedEmailData, SendEmailResult } from '@/lib/messaging/email/types'

const logger = createLogger('AwsSesDirectProvider')

type SesClient = {
  send: (command: unknown) => Promise<unknown>
}

let sesClient: SesClient | null = null

function resolveRegion(): string | undefined {
  const region = env.AWS_SES_REGION ?? env.AWS_REGION
  return region?.trim() || undefined
}

function resolveCredentials():
  | { accessKeyId: string; secretAccessKey: string }
  | undefined {
  const accessKeyId = env.AWS_ACCESS_KEY_ID?.trim()
  const secretAccessKey = env.AWS_SECRET_ACCESS_KEY?.trim()
  if (!accessKeyId || !secretAccessKey) return undefined
  return { accessKeyId, secretAccessKey }
}

function extractAddress(addr?: string): string | null {
  if (!addr) return null
  const angle = addr.match(/<(.+?)>/)
  if (angle?.[1]) return angle[1].trim()
  const match = addr.match(/([^\s<>]+@[^\s<>]+)/)
  if (match?.[1]) return match[1].trim()
  return null
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

async function ensureSesClient(region: string, credentials: { accessKeyId: string; secretAccessKey: string }) {
  if (sesClient) return sesClient

  const { SESClient } = await import('@aws-sdk/client-ses')
  sesClient = new SESClient({
    region,
    credentials,
  })
  logger.info('AWS SES direct client initialized', { region })
  return sesClient
}

async function sendWithAwsSesDirect(data: ProcessedEmailData): Promise<SendEmailResult> {
  const region = resolveRegion()
  const credentials = resolveCredentials()
  if (!region || !credentials) {
    throw new Error('AWS SES direct provider is not configured')
  }

  const client = await ensureSesClient(region, credentials)

  if (data.attachments && data.attachments.length > 0) {
    throw new Error('AWS SES direct send does not support attachments')
  }

  const toAddresses = Array.isArray(data.to) ? data.to : [data.to]
  const body: { Html?: { Data: string }; Text?: { Data: string } } = {}
  if (data.html) body.Html = { Data: data.html }
  if (data.text) body.Text = { Data: data.text }

  const sourceEmailOnly = extractAddress(data.senderEmail) || data.senderEmail?.trim()
  if (!sourceEmailOnly) throw new Error('Invalid From address for SES')
  if (/\s/.test(sourceEmailOnly)) throw new Error('Invalid From address contains whitespace')

  let replyToAddresses: string[] | undefined
  if (data.replyTo) {
    const rawReply = Array.isArray(data.replyTo) ? data.replyTo : [data.replyTo]
    replyToAddresses = rawReply
      .map((reply) => extractAddress(reply) || reply.trim())
      .filter(Boolean) as string[]
    if (replyToAddresses.length === 0) replyToAddresses = undefined
  }

  const params = {
    Destination: {
      ToAddresses: toAddresses,
    },
    Message: {
      Subject: { Data: data.subject },
      Body: body,
    },
    Source: sourceEmailOnly,
    ReplyToAddresses: replyToAddresses,
  }

  const hasDisplayName = /<.+>/.test(data.senderEmail)

  if (hasDisplayName) {
    const CRLF = '\r\n'
    const boundary = `----=_sim_mailer_${Date.now()}`

    const headers: string[] = []
    headers.push(`From: ${data.senderEmail}`)
    headers.push(`To: ${toAddresses.join(', ')}`)
    headers.push(`Subject: ${data.subject}`)
    headers.push('MIME-Version: 1.0')
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`)
    if (replyToAddresses && replyToAddresses.length > 0) {
      headers.push(`Reply-To: ${replyToAddresses.join(', ')}`)
    }
    for (const [key, value] of Object.entries(data.headers || {})) {
      headers.push(`${key}: ${value}`)
    }

    let mime = `${headers.join(CRLF)}${CRLF}${CRLF}`
    mime += `--${boundary}${CRLF}`
    mime += `Content-Type: text/plain; charset=UTF-8${CRLF}`
    mime += `Content-Transfer-Encoding: 7bit${CRLF}${CRLF}`
    mime += `${data.text || stripHtml(data.html || '')}${CRLF}${CRLF}`
    mime += `--${boundary}${CRLF}`
    mime += `Content-Type: text/html; charset=UTF-8${CRLF}`
    mime += `Content-Transfer-Encoding: 7bit${CRLF}${CRLF}`
    mime += `${data.html || ''}${CRLF}${CRLF}`
    mime += `--${boundary}--${CRLF}`

    const { SendRawEmailCommand } = await import('@aws-sdk/client-ses')
    const resp = await client.send(new SendRawEmailCommand({ RawMessage: { Data: Buffer.from(mime) } }))
    return {
      success: true,
      message: 'Email sent successfully via AWS SES (raw)',
      data: resp,
    }
  }

  const { SendEmailCommand } = await import('@aws-sdk/client-ses')
  const resp = await client.send(new SendEmailCommand(params))
  return {
    success: true,
    message: 'Email sent successfully via AWS SES',
    data: resp,
  }
}

/**
 * AWS SES via the v1 SDK client and explicit env credentials (`AWS_REGION` +
 * `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY`). Used when the nodemailer SES
 * transport is not configured but the deployment already ships S3 credentials.
 */
export function createAwsSesDirectProvider(): MailProvider | null {
  if (!resolveRegion() || !resolveCredentials()) return null

  return {
    name: 'ses-direct',
    send: async (data) => {
      try {
        return await sendWithAwsSesDirect(data)
      } catch (error) {
        logger.error('AWS SES direct send error:', error)
        throw error
      }
    },
  }
}

import { createLogger } from '@sim/logger'
import { Resend } from 'resend'
import { env } from '@/lib/core/config/env'
import { generateUnsubscribeToken, isUnsubscribed } from '@/lib/messaging/email/unsubscribe'
import { getFromEmailAddress, hasEmailHeaderControlChars } from '@/lib/messaging/email/utils'
import { getErrorMessage } from '@sim/utils/errors'
import { processEmailData, shouldSkipForUnsubscribe } from '@/lib/messaging/email/prepare'
import { activeProviders } from '@/lib/messaging/email/providers'
import type {
  BatchEmailOptions,
  BatchSendEmailResult,
  EmailOptions,
  ProcessedEmailData,
  SendEmailResult,
} from '@/lib/messaging/email/types'

export type {
  BatchEmailOptions,
  BatchSendEmailResult,
  EmailAttachment,
  EmailOptions,
  EmailType,
  MailProvider,
  MailProviderName,
  ProcessedEmailData,
  SendEmailResult,
} from '@/lib/messaging/email/types'

const logger = createLogger('Mailer')

const SKIPPED_UNSUBSCRIBED_RESULT: SendEmailResult = {
  success: true,
  message: 'Email skipped (user unsubscribed)',
  data: { id: 'skipped-unsubscribed' },
}

const MOCK_EMAIL_RESULT: SendEmailResult = {
  success: true,
  message: 'Email logging successful (no email service configured)',
  data: { id: 'mock-email-id' },
}



// AWS SES runtime placeholder and credentials detection (we initialize lazily)
let sesClient: any | null = null
const rawAwsRegion = (env.AWS_REGION as string | undefined) ?? process.env.AWS_REGION
const rawAwsAccessKeyId =
  (env.AWS_ACCESS_KEY_ID as string | undefined) ?? process.env.AWS_ACCESS_KEY_ID
const rawAwsSecretAccessKey =
  (env.AWS_SECRET_ACCESS_KEY as string | undefined) ?? process.env.AWS_SECRET_ACCESS_KEY
const awsRegion = rawAwsRegion ? String(rawAwsRegion).trim() : undefined
const awsAccessKeyId = rawAwsAccessKeyId ? String(rawAwsAccessKeyId).trim() : undefined
const awsSecretAccessKey = rawAwsSecretAccessKey ? String(rawAwsSecretAccessKey).trim() : undefined
const awsCredsPresent = Boolean(awsRegion && awsAccessKeyId && awsSecretAccessKey)

/**
 * Check if any email service is configured and available
 */
export function hasEmailService(): boolean {
  return activeProviders.length > 0
}

export async function sendEmail(options: EmailOptions): Promise<SendEmailResult> {
  try {
    if (await shouldSkipForUnsubscribe(options)) {
      logger.info('Email not sent (user unsubscribed):', {
        to: options.to,
        subject: options.subject,
        emailType: options.emailType,
      })
      return SKIPPED_UNSUBSCRIBED_RESULT
    }

    const data = processEmailData(options)

    if (activeProviders.length === 0) {
      logger.info('Email not sent (no email service configured):', {
        to: data.to,
        subject: data.subject,
        from: data.senderEmail,
      })
      return MOCK_EMAIL_RESULT
    }

    return await dispatchWithFallback(data)
  } catch (error) {
    logger.error('Error sending email:', error)
    return { success: false, message: 'Failed to send email' }
  }
}

async function dispatchWithFallback(data: ProcessedEmailData): Promise<SendEmailResult> {
  let lastError: unknown
  for (const provider of activeProviders) {
    try {
      return await provider.send(data)
    } catch (error) {
      lastError = error
      logger.warn(`${provider.name} failed, trying next provider`, error)
    }
  }
  logger.error('All email providers failed', lastError)
  return {
    success: false,
    message: `All email providers failed: ${getErrorMessage(lastError, 'unknown error')}`,
  }
}

interface PreparedBatchEntry {
  index: number
  data: ProcessedEmailData | null
  skippedResult: SendEmailResult | null
}

async function prepareBatch(emails: EmailOptions[]): Promise<PreparedBatchEntry[]> {
  return Promise.all(
    emails.map(async (email, index): Promise<PreparedBatchEntry> => {
      try {
        if (await shouldSkipForUnsubscribe(email)) {
          return { index, data: null, skippedResult: SKIPPED_UNSUBSCRIBED_RESULT }
        }
        return { index, data: processEmailData(email), skippedResult: null }
      } catch (error) {
        return {
          index,
          data: null,
          skippedResult: {
            success: false,
            message: getErrorMessage(error, 'Failed to prepare email'),
          },
        }
      }
    })
  )
}

// Ensure SES client is initialized (lazy, dynamic import)
async function ensureSesClient(): Promise<void> {
  if (sesClient) return
  if (!awsCredsPresent) return
  try {
    // Dynamically import AWS SES at runtime. Ignore TS errors if the package isn't installed.
    // @ts-ignore
    const awsModule = await import('@aws-sdk/client-ses')
    const { SESClient } = awsModule
    // awsCredsPresent ensures region and credentials are defined, assert non-null to satisfy types
    sesClient = new SESClient({
      region: awsRegion!,
      credentials: { accessKeyId: awsAccessKeyId!, secretAccessKey: awsSecretAccessKey! },
    })
    logger.info('AWS SES client initialized')
  } catch (err) {
    logger.error('Failed to dynamically import or initialize AWS SES client:', err)
    sesClient = null
  }
}

async function sendWithSes(data: ProcessedEmailData): Promise<SendEmailResult> {
  if (!awsCredsPresent) throw new Error('AWS credentials not configured')
  await ensureSesClient()
  if (!sesClient) throw new Error('AWS SES client not available')

  // Basic SES send
  if (data.attachments && data.attachments.length > 0) {
    throw new Error('SES send does not support attachments in this implementation')
  }

  const toAddresses = Array.isArray(data.to) ? data.to : [data.to]
  const body: any = {}
  if (data.html) body.Html = { Data: data.html }
  if (data.text) body.Text = { Data: data.text }

  // SES requires a plain email address for Source (no display name). Extract the
  // email address if a display name is present (e.g. "Name <email@domain>").
  const extractAddress = (addr?: string | undefined): string | null => {
    if (!addr) return null
    const angle = addr.match(/<(.+?)>/)
    if (angle?.[1]) return angle[1].trim()
    const m = addr.match(/([^\s<>]+@[^\s<>]+)/)
    if (m?.[1]) return m[1].trim()
    return null
  }

  const sourceEmailOnly = extractAddress(data.senderEmail) || data.senderEmail?.trim()
  if (!sourceEmailOnly) throw new Error('Invalid From address for SES')
  if (/\s/.test(sourceEmailOnly)) throw new Error('Invalid From address contains whitespace')

  let replyToAddresses: string[] | undefined
  if (data.replyTo) {
    const rawReply = Array.isArray(data.replyTo) ? data.replyTo : [data.replyTo]
    replyToAddresses = rawReply
      .map((r) => extractAddress(r) || r.trim())
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
    // Headers like List-Unsubscribe are not directly supported here; SES can use Tags or Raw messages.
  }

  try {
    // If the provided sender contains a display name (e.g. "Name <email@domain>")
    // we must send a raw MIME message so the display name is preserved. The
    // SendEmail API requires a plain email address for Source and will not
    // preserve a display name. Compose a simple multipart/alternative MIME
    // message (text + html) and send via SendRawEmail.
    const hasDisplayName = /<.+>/.test(data.senderEmail)

    if (hasDisplayName) {
      // Build a raw MIME message
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
      // Include any custom headers (e.g., List-Unsubscribe)
      for (const [k, v] of Object.entries(data.headers || {})) {
        headers.push(`${k}: ${v}`)
      }

      let mime = headers.join(CRLF) + CRLF + CRLF

      // Plain text part
      mime += `--${boundary}${CRLF}`
      mime += `Content-Type: text/plain; charset=UTF-8${CRLF}`
      mime += `Content-Transfer-Encoding: 7bit${CRLF}${CRLF}`
      mime += (data.text || stripHtml(data.html || '')) + CRLF + CRLF

      // HTML part
      mime += `--${boundary}${CRLF}`
      mime += `Content-Type: text/html; charset=UTF-8${CRLF}`
      mime += `Content-Transfer-Encoding: 7bit${CRLF}${CRLF}`
      mime += (data.html || '') + CRLF + CRLF

      mime += `--${boundary}--${CRLF}`

      // Send as raw
      // @ts-ignore
      const { SendRawEmailCommand } = await import('@aws-sdk/client-ses')
      const rawCommand = new SendRawEmailCommand({ RawMessage: { Data: Buffer.from(mime) } })
      const resp = await sesClient.send(rawCommand)
      return {
        success: true,
        message: 'Email sent successfully via AWS SES (raw)',
        data: resp,
      }
    }

    // Fallback to SendEmail API when no display name is present
    // @ts-ignore
    const { SendEmailCommand } = await import('@aws-sdk/client-ses')
    const command = new SendEmailCommand(params)
    const resp = await sesClient.send(command)
    return {
      success: true,
      message: 'Email sent successfully via AWS SES',
      data: resp,
    }
  } catch (err) {
    logger.error('AWS SES send error:', err)
    throw err
  }
}

// Small utility to strip HTML tags for the plain-text fallback in the MIME body
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, '')
}

export async function sendBatchEmails(options: BatchEmailOptions): Promise<BatchSendEmailResult> {
  try {
    const entries = await prepareBatch(options.emails)
    const sendable = entries.filter(
      (e): e is PreparedBatchEntry & { data: ProcessedEmailData } => e.data !== null
    )

    if (sendable.length === 0) {
      const results = entries.map((e) => e.skippedResult ?? SKIPPED_UNSUBSCRIBED_RESULT)
      const allUnsubscribed =
        entries.length > 0 && entries.every((e) => e.skippedResult === SKIPPED_UNSUBSCRIBED_RESULT)
      return {
        success: results.every((r) => r.success),
        message:
          options.emails.length === 0
            ? 'No emails to send'
            : allUnsubscribed
              ? 'All batch emails skipped (users unsubscribed)'
              : 'No emails sent (all entries skipped or failed validation)',
        results,
        data: { count: 0 },
      }
    }

    const batchProvider = activeProviders.find((p) => p.sendBatch)
    if (batchProvider) {
      try {
        const batchResult = await batchProvider.sendBatch!(sendable.map((e) => e.data))
        return mergeBatchResults(entries, sendable, batchResult.results)
      } catch (error) {
        logger.warn(`${batchProvider.name} batch failed, falling back to per-message sends`, error)
      }
    }

    const sentResults = await Promise.all(
      sendable.map((entry) => sendEmail(options.emails[entry.index]))
    )
    return mergeBatchResults(entries, sendable, sentResults)
  } catch (error) {
    logger.error('Error in batch email sending:', error)
    return { success: false, message: 'Failed to send batch emails', results: [] }
  }
}

function mergeBatchResults(
  entries: PreparedBatchEntry[],
  sendable: PreparedBatchEntry[],
  sentResults: SendEmailResult[]
): BatchSendEmailResult {
  const resultsByIndex = new Map<number, SendEmailResult>()
  sendable.forEach((entry, i) => {
    resultsByIndex.set(entry.index, sentResults[i])
  })

  const results = entries.map(
    (entry) => resultsByIndex.get(entry.index) ?? entry.skippedResult ?? SKIPPED_UNSUBSCRIBED_RESULT
  )

  // sentCount excludes both unsubscribe-skipped (success but not delivered)
  // and prepare-failed entries — only counts what actually went out the wire.
  const sentCount = sentResults.filter((r) => r.success).length
  const skippedCount = entries.length - sendable.length
  const allSucceeded = sentCount === sendable.length && skippedCount === 0
  return {
    success: results.every((r) => r.success),
    message:
      skippedCount > 0
        ? `${sentCount} emails sent, ${skippedCount} skipped`
        : allSucceeded
          ? 'All batch emails sent successfully'
          : `${sentCount}/${sendable.length} emails sent successfully`,
    results,
    data: { count: sentCount },
  }
}

import { EmailClient, type EmailMessage } from '@azure/communication-email'
import { createLogger } from '@sim/logger'
import { Resend } from 'resend'
import { env } from '@/lib/core/config/env'
import { generateUnsubscribeToken, isUnsubscribed } from '@/lib/messaging/email/unsubscribe'
import { getFromEmailAddress } from '@/lib/messaging/email/utils'

const logger = createLogger('Mailer')

export type EmailType = 'transactional' | 'marketing' | 'updates' | 'notifications'

export interface EmailAttachment {
  filename: string
  content: string | Buffer
  contentType: string
  disposition?: 'attachment' | 'inline'
}

export interface EmailOptions {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  from?: string
  emailType?: EmailType
  includeUnsubscribe?: boolean
  attachments?: EmailAttachment[]
  replyTo?: string
}

export interface BatchEmailOptions {
  emails: EmailOptions[]
}

export interface SendEmailResult {
  success: boolean
  message: string
  data?: any
}

export interface BatchSendEmailResult {
  success: boolean
  message: string
  results: SendEmailResult[]
  data?: any
}

interface ProcessedEmailData {
  to: string | string[]
  subject: string
  html?: string
  text?: string
  senderEmail: string
  headers: Record<string, string>
  attachments?: EmailAttachment[]
  replyTo?: string
}

const resendApiKey = env.RESEND_API_KEY
const azureConnectionString = env.AZURE_ACS_CONNECTION_STRING

const resend =
  resendApiKey && resendApiKey !== 'placeholder' && resendApiKey.trim() !== ''
    ? new Resend(resendApiKey)
    : null

const azureEmailClient =
  azureConnectionString && azureConnectionString.trim() !== ''
    ? new EmailClient(azureConnectionString)
    : null

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
  return !!(awsCredsPresent || resend || azureEmailClient)
}

export async function sendEmail(options: EmailOptions): Promise<SendEmailResult> {
  try {
    if (options.emailType !== 'transactional') {
      const unsubscribeType = options.emailType as 'marketing' | 'updates' | 'notifications'
      const primaryEmail = Array.isArray(options.to) ? options.to[0] : options.to
      const hasUnsubscribed = await isUnsubscribed(primaryEmail, unsubscribeType)
      if (hasUnsubscribed) {
        logger.info('Email not sent (user unsubscribed):', {
          to: options.to,
          subject: options.subject,
          emailType: options.emailType,
        })
        return {
          success: true,
          message: 'Email skipped (user unsubscribed)',
          data: { id: 'skipped-unsubscribed' },
        }
      }
    }

    const processedData = await processEmailData(options)

    if (resend) {
      try {
        return await sendWithResend(processedData)
      } catch (error) {
        logger.warn('Resend failed, attempting Azure Communication Services fallback:', error)
      }
    }

    if (azureEmailClient) {
      try {
        return await sendWithAzure(processedData)
      } catch (error) {
        logger.warn('Azure Communication Services failed, attempting AWS SES fallback:', error)
        // continue to attempt SES below
      }
    }

    // Fallback to AWS SES if AWS credentials are present
    if (awsCredsPresent) {
      try {
        return await sendWithSes(processedData)
      } catch (error) {
        logger.error('AWS SES also failed:', error)
        return {
          success: false,
          message: 'All configured email providers failed',
        }
      }
    }

    logger.info('Email not sent (no email service configured):', {
      to: options.to,
      subject: options.subject,
      from: processedData.senderEmail,
    })
    return {
      success: true,
      message: 'Email logging successful (no email service configured)',
      data: { id: 'mock-email-id' },
    }
  } catch (error) {
    logger.error('Error sending email:', error)
    return {
      success: false,
      message: 'Failed to send email',
    }
  }
}

interface UnsubscribeData {
  headers: Record<string, string>
  html?: string
  text?: string
}

function addUnsubscribeData(
  recipientEmail: string,
  emailType: string,
  html?: string,
  text?: string
): UnsubscribeData {
  const unsubscribeToken = generateUnsubscribeToken(recipientEmail, emailType)
  const baseUrl = env.NEXT_PUBLIC_APP_URL || 'https://sim.ai'
  const encodedEmail = encodeURIComponent(recipientEmail)
  const unsubscribeUrl = `${baseUrl}/unsubscribe?token=${unsubscribeToken}&email=${encodedEmail}`

  return {
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    html: html
      ?.replace(/\{\{UNSUBSCRIBE_TOKEN\}\}/g, unsubscribeToken)
      .replace(/\{\{UNSUBSCRIBE_EMAIL\}\}/g, encodedEmail),
    text: text
      ?.replace(/\{\{UNSUBSCRIBE_TOKEN\}\}/g, unsubscribeToken)
      .replace(/\{\{UNSUBSCRIBE_EMAIL\}\}/g, encodedEmail),
  }
}

async function processEmailData(options: EmailOptions): Promise<ProcessedEmailData> {
  const {
    to,
    subject,
    html,
    text,
    from,
    emailType = 'transactional',
    includeUnsubscribe = true,
    attachments,
    replyTo,
  } = options

  const senderEmail = from || getFromEmailAddress()

  let finalHtml = html
  let finalText = text
  let headers: Record<string, string> = {}

  if (includeUnsubscribe && emailType !== 'transactional') {
    const primaryEmail = Array.isArray(to) ? to[0] : to
    const unsubData = addUnsubscribeData(primaryEmail, emailType, html, text)
    headers = unsubData.headers
    finalHtml = unsubData.html
    finalText = unsubData.text
  }

  return {
    to,
    subject,
    html: finalHtml,
    text: finalText,
    senderEmail,
    headers,
    attachments,
    replyTo,
  }
}

async function sendWithResend(data: ProcessedEmailData): Promise<SendEmailResult> {
  if (!resend) throw new Error('Resend not configured')

  const fromAddress = data.senderEmail

  const emailData: any = {
    from: fromAddress,
    to: data.to,
    subject: data.subject,
    headers: Object.keys(data.headers).length > 0 ? data.headers : undefined,
  }

  if (data.html) emailData.html = data.html
  if (data.text) emailData.text = data.text
  if (data.replyTo) emailData.replyTo = data.replyTo
  if (data.attachments) {
    emailData.attachments = data.attachments.map((att) => ({
      filename: att.filename,
      content: typeof att.content === 'string' ? att.content : att.content.toString('base64'),
      contentType: att.contentType,
      disposition: att.disposition || 'attachment',
    }))
  }

  const { data: responseData, error } = await resend.emails.send(emailData)

  if (error) {
    throw new Error(error.message || 'Failed to send email via Resend')
  }

  return {
    success: true,
    message: 'Email sent successfully via Resend',
    data: responseData,
  }
}

async function sendWithAzure(data: ProcessedEmailData): Promise<SendEmailResult> {
  if (!azureEmailClient) throw new Error('Azure Communication Services not configured')

  if (!data.html && !data.text) {
    throw new Error('Azure Communication Services requires either HTML or text content')
  }

  const senderEmailOnly = data.senderEmail.includes('<')
    ? data.senderEmail.match(/<(.+)>/)?.[1] || data.senderEmail
    : data.senderEmail

  const message: EmailMessage = {
    senderAddress: senderEmailOnly,
    content: data.html
      ? {
          subject: data.subject,
          html: data.html,
        }
      : {
          subject: data.subject,
          plainText: data.text!,
        },
    recipients: {
      to: Array.isArray(data.to)
        ? data.to.map((email) => ({ address: email }))
        : [{ address: data.to }],
    },
    headers: data.headers,
  }

  const poller = await azureEmailClient.beginSend(message)
  const result = await poller.pollUntilDone()

  if (result.status === 'Succeeded') {
    return {
      success: true,
      message: 'Email sent successfully via Azure Communication Services',
      data: { id: result.id },
    }
  }
  throw new Error(`Azure Communication Services failed with status: ${result.status}`)
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
    const results: SendEmailResult[] = []

    if (resend) {
      try {
        return await sendBatchWithResend(options.emails)
      } catch (error) {
        logger.warn('Resend batch failed, falling back to individual sends:', error)
      }
    }

    logger.info('Sending batch emails individually')
    for (const email of options.emails) {
      try {
        const result = await sendEmail(email)
        results.push(result)
      } catch (error) {
        results.push({
          success: false,
          message: error instanceof Error ? error.message : 'Failed to send email',
        })
      }
    }

    const successCount = results.filter((r) => r.success).length
    return {
      success: successCount === results.length,
      message:
        successCount === results.length
          ? 'All batch emails sent successfully'
          : `${successCount}/${results.length} emails sent successfully`,
      results,
      data: { count: successCount },
    }
  } catch (error) {
    logger.error('Error in batch email sending:', error)
    return {
      success: false,
      message: 'Failed to send batch emails',
      results: [],
    }
  }
}

async function sendBatchWithResend(emails: EmailOptions[]): Promise<BatchSendEmailResult> {
  if (!resend) throw new Error('Resend not configured')

  const results: SendEmailResult[] = []
  const skippedIndices: number[] = []
  const batchEmails: any[] = []

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i]
    const { emailType = 'transactional', includeUnsubscribe = true } = email

    if (emailType !== 'transactional') {
      const unsubscribeType = emailType as 'marketing' | 'updates' | 'notifications'
      const primaryEmail = Array.isArray(email.to) ? email.to[0] : email.to
      const hasUnsubscribed = await isUnsubscribed(primaryEmail, unsubscribeType)
      if (hasUnsubscribed) {
        skippedIndices.push(i)
        results.push({
          success: true,
          message: 'Email skipped (user unsubscribed)',
          data: { id: 'skipped-unsubscribed' },
        })
        continue
      }
    }

    const senderEmail = email.from || getFromEmailAddress()
    const emailData: any = {
      from: senderEmail,
      to: email.to,
      subject: email.subject,
    }

    if (includeUnsubscribe && emailType !== 'transactional') {
      const primaryEmail = Array.isArray(email.to) ? email.to[0] : email.to
      const unsubData = addUnsubscribeData(primaryEmail, emailType, email.html, email.text)
      emailData.headers = unsubData.headers
      if (unsubData.html) emailData.html = unsubData.html
      if (unsubData.text) emailData.text = unsubData.text
    } else {
      if (email.html) emailData.html = email.html
      if (email.text) emailData.text = email.text
    }

    batchEmails.push(emailData)
  }

  if (batchEmails.length === 0) {
    return {
      success: true,
      message: 'All batch emails skipped (users unsubscribed)',
      results,
      data: { count: 0 },
    }
  }

  try {
    const response = await resend.batch.send(batchEmails as any)

    if (response.error) {
      throw new Error(response.error.message || 'Resend batch API error')
    }

    batchEmails.forEach((_, index) => {
      results.push({
        success: true,
        message: 'Email sent successfully via Resend batch',
        data: { id: `batch-${index}` },
      })
    })

    return {
      success: true,
      message:
        skippedIndices.length > 0
          ? `${batchEmails.length} emails sent, ${skippedIndices.length} skipped (unsubscribed)`
          : 'All batch emails sent successfully via Resend',
      results,
      data: { count: batchEmails.length },
    }
  } catch (error) {
    logger.error('Resend batch send failed:', error)
    throw error
  }
}

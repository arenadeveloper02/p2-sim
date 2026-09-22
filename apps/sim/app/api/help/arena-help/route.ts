import { db } from '@sim/db'
import { type HelpSupportIssueAttachment, user } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import { normalizeEmail } from '@sim/utils/string'
import { eq, or } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { renderHelpConfirmationEmail } from '@/components/emails'
import { helpFormBodySchema } from '@/lib/api/contracts/common'
import { validationErrorResponse } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { verifyCronAuth } from '@/lib/auth/internal'
import { generateRequestId } from '@/lib/core/utils/request'
import { getHelpInboxEmail } from '@/lib/core/utils/urls'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import {
  formatHelpSupportAttachmentLinks,
  persistHelpSupportIssue,
  uploadHelpSupportAttachments,
} from '@/lib/help/support-issue'
import { sendEmail } from '@/lib/messaging/email/mailer'
import { getFromEmailAddress } from '@/lib/messaging/email/utils'

const logger = createLogger('HelpAPI')

interface HelpRequester {
  userId: string | null
  email: string
}

/**
 * Resolves a Sim user from an email address for cron-authenticated help requests.
 * Unknown emails are stored with a null user id.
 */
async function resolveUserByEmail(emailId: string): Promise<HelpRequester> {
  const normalizedEmail = normalizeEmail(emailId)
  const [userRecord] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(or(eq(user.email, normalizedEmail), eq(user.normalizedEmail, normalizedEmail)))
    .limit(1)

  if (!userRecord) {
    return { userId: null, email: emailId }
  }

  return { userId: userRecord.id, email: userRecord.email }
}

function readFormString(formData: FormData, key: string): string | null {
  const value = formData.get(key)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * POST /api/help/arena-help
 * Submits a help/support issue.
 * Auth: logged-in Sim session, or `Authorization: Bearer <CRON_SECRET>`.
 * Cron requests must include `email` (or `emailId`). Unknown emails are stored with a null user id.
 */
export const POST = withRouteHandler(async (req: NextRequest) => {
  const requestId = generateRequestId()

  try {
    const session = await getSession()
    const sessionRequester: HelpRequester | null =
      session?.user?.id && session.user.email
        ? { userId: session.user.id, email: session.user.email }
        : null

    if (!sessionRequester) {
      const authError = verifyCronAuth(req, 'Arena help request')
      if (authError) {
        logger.warn(`[${requestId}] Unauthorized help request attempt`)
        return authError
      }
    }

    const formData = await req.formData()

    const subject = formData.get('subject') as string
    const message = formData.get('message') as string
    const type = formData.get('type') as string
    const workflowId = formData.get('workflowId') as string | null
    const workspaceId = formData.get('workspaceId') as string
    const userAgent = formData.get('userAgent') as string | null

    const validationResult = helpFormBodySchema.safeParse({
      subject,
      message,
      type,
    })

    if (!validationResult.success) {
      logger.warn(`[${requestId}] Invalid help request data`, {
        issues: validationResult.error.issues,
      })
      return validationErrorResponse(validationResult.error)
    }

    let requester = sessionRequester
    if (!requester) {
      const formEmail = readFormString(formData, 'email') ?? readFormString(formData, 'emailId')
      if (!formEmail) {
        return NextResponse.json(
          { error: 'email is required when authenticating with CRON_SECRET' },
          { status: 400 }
        )
      }

      requester = await resolveUserByEmail(formEmail)
    }

    const { userId, email } = requester

    logger.info(`[${requestId}] Processing help request`, {
      type,
      auth: sessionRequester ? 'session' : 'cron',
      email: `${email.substring(0, 3)}***`, // Log partial email for privacy
    })

    const images: { filename: string; content: Buffer; contentType: string }[] = []

    for (const [key, value] of formData.entries()) {
      if (key.startsWith('image_') && typeof value !== 'string') {
        if (value && 'arrayBuffer' in value) {
          const buffer = Buffer.from(await value.arrayBuffer())
          const filename = value.name || `image_${key.split('_')[1]}`

          images.push({
            filename,
            content: buffer,
            contentType: value.type || 'application/octet-stream',
          })
        }
      }
    }

    const issueId = generateId()
    const validatedType = validationResult.data.type

    let attachments: HelpSupportIssueAttachment[] = []
    try {
      attachments = await uploadHelpSupportAttachments(issueId, images)
    } catch (uploadError) {
      logger.error(`[${requestId}] Failed to upload help support attachments`, uploadError)
      return NextResponse.json({ error: 'Failed to upload attachments' }, { status: 500 })
    }

    try {
      await persistHelpSupportIssue({
        id: issueId,
        userId,
        userEmail: email,
        workspaceId: workspaceId?.trim() || null,
        workflowId: workflowId?.trim() || null,
        type: validatedType,
        subject: validationResult.data.subject,
        message: validationResult.data.message,
        attachments,
      })
    } catch (dbError) {
      logger.error(`[${requestId}] Failed to persist help support issue`, dbError)
      return NextResponse.json({ error: 'Failed to save help request' }, { status: 500 })
    }

    let emailText = `
Type: ${validatedType}
From: ${email}
User ID: ${userId ?? 'N/A'}
Workspace ID: ${workspaceId ?? 'N/A'}
Workflow ID: ${workflowId ?? 'N/A'}
Browser: ${userAgent ?? 'N/A'}

${validationResult.data.message}
    `

    emailText += formatHelpSupportAttachmentLinks(attachments)

    const helpInboxEmail = getHelpInboxEmail()

    const emailResult = await sendEmail({
      to: [helpInboxEmail],
      subject: `[${validatedType.toUpperCase()}] ${validationResult.data.subject}`,
      text: emailText,
      from: getFromEmailAddress(),
      replyTo: email,
      emailType: 'transactional',
    })

    if (!emailResult.success) {
      logger.error(`[${requestId}] Error sending help request email`, emailResult.message)
      return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
    }

    logger.info(`[${requestId}] Help request email sent successfully`, { issueId })

    try {
      const confirmationHtml = await renderHelpConfirmationEmail(validatedType, attachments.length)

      await sendEmail({
        to: [email],
        subject: `Your ${validatedType} request has been received: ${validationResult.data.subject}`,
        html: confirmationHtml,
        from: getFromEmailAddress(),
        replyTo: helpInboxEmail,
        emailType: 'transactional',
      })
    } catch (err) {
      logger.warn(`[${requestId}] Failed to send confirmation email`, err)
    }

    return NextResponse.json(
      { success: true, message: 'Help request submitted successfully' },
      { status: 200 }
    )
  } catch (error) {
    if (error instanceof Error && error.message.includes('not configured')) {
      logger.error(`[${requestId}] Email service configuration error`, error)
      return NextResponse.json(
        {
          error:
            'Email service configuration error. Please check your email service configuration.',
        },
        { status: 500 }
      )
    }

    logger.error(`[${requestId}] Error processing help request`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
})

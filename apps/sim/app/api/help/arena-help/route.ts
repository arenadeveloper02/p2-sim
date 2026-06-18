import type { HelpSupportIssueAttachment } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import { type NextRequest, NextResponse } from 'next/server'
import { renderHelpConfirmationEmail } from '@/components/emails'
import { helpFormBodySchema } from '@/lib/api/contracts/common'
import { validationErrorResponse } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
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

export const POST = withRouteHandler(async (req: NextRequest) => {
  const requestId = generateRequestId()

  try {
    const session = await getSession()
    if (!session?.user?.email) {
      logger.warn(`[${requestId}] Unauthorized help request attempt`)
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const email = session.user.email

    const formData = await req.formData()

    const subject = formData.get('subject') as string
    const message = formData.get('message') as string
    const type = formData.get('type') as string
    const workflowId = formData.get('workflowId') as string | null
    const workspaceId = formData.get('workspaceId') as string
    const userAgent = formData.get('userAgent') as string | null

    logger.info(`[${requestId}] Processing help request`, {
      type,
      email: `${email.substring(0, 3)}***`, // Log partial email for privacy
    })

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

    const userId = session.user.id
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
User ID: ${userId}
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

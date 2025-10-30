import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logs/console/logger'
import { db } from '@/db'
import { chat, templates, user, workflow } from '@/db/schema'

const logger = createLogger('ChatAgentsAPI')

/**
 * GET /api/chat/agents
 * Fetch all chats accessible by a user based on their email
 *
 * Query Parameters:
 * - emailId: User's email address (required)
 *
 * Access Rules:
 * 1. User must exist in the user table
 * 2. Returns chats where:
 *    - user_id matches the user's id, OR
 *    - user's email is in the allowed_emails array, OR
 *    - user's email domain matches a domain pattern in allowed_emails (e.g., '@example.com')
 *
 * Response includes:
 * - From chat table: title, workflow_id, subdomain
 * - From workflow table: name, description, workspace_id
 */
export async function GET(request: NextRequest) {
  try {
    // Extract emailId from query parameters
    const { searchParams } = new URL(request.url)
    const emailId = searchParams.get('emailId')

    if (!emailId) {
      logger.warn('Missing required parameter: emailId')
      return NextResponse.json(
        {
          success: false,
          error: 'emailId parameter is required',
        },
        { status: 400 }
      )
    }

    logger.info(`Fetching chats for email: ${emailId}`)

    // Step 1: Verify user exists and get their ID
    const userRecord = await db
      .select({
        id: user.id,
        email: user.email,
      })
      .from(user)
      .where(eq(user.email, emailId))
      .limit(1)

    if (userRecord.length === 0) {
      logger.warn(`User not found with email: ${emailId}`)
      return NextResponse.json(
        {
          success: false,
          error: 'User not found',
        },
        { status: 404 }
      )
    }

    const foundUser = userRecord[0]
    const userId = foundUser.id
    const userEmailDomain = emailId.substring(emailId.indexOf('@'))

    logger.info(`User found: ${userId}, email domain: ${userEmailDomain}`)

    // Step 2: Fetch all chats with workflow details
    // We need to check:
    // 1. userId matches
    // 2. email is in allowedEmails
    // 3. domain pattern matches (e.g., '@example.com' in allowedEmails)
    const chats = await db
      .select({
        chatId: chat.id,
        title: chat.title,
        workflowId: chat.workflowId,
        subdomain: chat.subdomain,
        userId: chat.userId,
        allowedEmails: chat.allowedEmails,
        workflowName: workflow.name,
        workflowDescription: workflow.description,
        templateDescription: templates.description,
        workspaceId: workflow.workspaceId,
        createdAt: chat.createdAt,
      })
      .from(chat)
      .innerJoin(workflow, eq(chat.workflowId, workflow.id))
      .leftJoin(templates, eq(templates.workflowId, workflow.id))
      .where(eq(chat.isActive, true))

    // Step 3: Filter chats based on access rules
    const accessibleChats = chats.filter((chatRecord) => {
      // Rule 1: User owns the chat
      if (chatRecord.userId === userId) {
        return true
      }

      // Rule 2 & 3: Check allowedEmails array
      if (chatRecord.allowedEmails) {
        const allowedEmailsList = Array.isArray(chatRecord.allowedEmails)
          ? chatRecord.allowedEmails
          : []

        for (const allowedEmail of allowedEmailsList) {
          if (typeof allowedEmail === 'string') {
            // Exact email match
            if (allowedEmail === emailId) {
              return true
            }
            // Domain pattern match (e.g., '@example.com')
            if (allowedEmail.startsWith('@') && userEmailDomain === allowedEmail) {
              return true
            }
          }
        }
      }

      return false
    })

    // Step 4: Format response
    const agentList = accessibleChats.map((chatRecord) => ({
      title: chatRecord.title,
      workflow_id: chatRecord.workflowId,
      subdomain: chatRecord.subdomain,
      workflow_name: chatRecord.workflowName,
      workflow_description: chatRecord.templateDescription || chatRecord.workflowDescription,
      workspace_id: chatRecord.workspaceId,
      created_at: chatRecord.createdAt.toISOString(),
    }))

    logger.info(`Found ${agentList.length} accessible chats for user ${userId}`)

    return NextResponse.json(
      {
        success: true,
        agentList: agentList,
        count: agentList.length,
      },
      { status: 200 }
    )
  } catch (error: any) {
    logger.error('Error fetching chats:', error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal server error',
      },
      { status: 500 }
    )
  }
}

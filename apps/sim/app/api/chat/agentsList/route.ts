import { db } from '@sim/db'
import { chat, user, webhook, workflow, workflowSchedule } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import type { SQL } from 'drizzle-orm'
import { and, desc, eq, isNull, ne } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { verifyCronAuth } from '@/lib/auth/internal'
import { getBaseUrl } from '@/lib/core/utils/urls'

const logger = createLogger('DeployedChatAgentsListAPI')

export const categories = [
  { value: 'creative', label: 'Creative' },
  { value: 'ma', label: 'MA' },
  { value: 'ppc', label: 'PPC' },
  { value: 'sales', label: 'Sales' },
  { value: 'seo', label: 'SEO' },
  { value: 'strategy', label: 'Strategy' },
  { value: 'waas', label: 'WAAS' },
  { value: 'hr', label: 'HR' },
] as const

interface AgentChatRow {
  chatId: string
  title: string
  authorEmail: string | null
  workflowId: string
  workflowName: string
  workspaceId: string | null
  department: string | null
  createdAt: Date
  allowedEmails: unknown
  description: string | null
}

/**
 * Returns true when allowedEmails has at least one string whose first character is '@'
 * (e.g. '@position2.com', '@northstar'). Ignores email-style entries (e.g. saiteja.s@position2.com).
 */
function hasAllowedEmailStartingWithAtSymbol(allowedEmails: unknown): boolean {
  const list = Array.isArray(allowedEmails) ? allowedEmails : []
  return list.some((entry) => typeof entry === 'string' && entry.length > 0 && entry[0] === '@')
}

/**
 * Resolves departmentName param (e.g. 'WAAS' or 'waas') to category value for DB filter.
 * Matches case-insensitively against category value or label.
 */
function resolveDepartmentValue(departmentName: string | null): string | undefined {
  if (!departmentName?.trim()) return undefined
  const normalized = departmentName.trim().toLowerCase()
  const found = categories.find(
    (c) => c.value.toLowerCase() === normalized || c.label.toLowerCase() === normalized
  )
  return found?.value
}

/**
 * Returns the display label for a department value (stored in DB as category `value`).
 */
function toDepartmentLabel(departmentValue: string | null): string | null {
  if (!departmentValue) return null
  return categories.find((c) => c.value === departmentValue)?.label ?? departmentValue
}

/** Maps a DB row to the response agent list item shape. */
function toAgentListItem(row: AgentChatRow) {
  return {
    id: row.chatId,
    name: row.title,
    authorEmail: row.authorEmail,
    workflowId: row.workflowId,
    workflowName: row.workflowName,
    workspaceId: row.workspaceId,
    departmentName: toDepartmentLabel(row.department),
    created_at: row.createdAt.toISOString(),
    description: row.description,
    "status": "published",
    redirectUrl: getBaseUrl() + `/chat/${row.workflowId}?workspaceId=${row.workspaceId}`,
    "showConversation": false,
    // allowedEmails: row.allowedEmails,
  }
}

/**
 * Determines whether a chat is accessible by a given email based on `allowedEmails`.
 *
 * Access is granted when:
 * - The exact email is present (e.g. `user@company.com`)
 * - The user's domain pattern is present (e.g. `@company.com`)
 */
function isMyAgentsChatAllowedByEmail(allowedEmails: unknown, emailId: string): boolean {
  if (!allowedEmails) return false
  const allowedEmailsList = Array.isArray(allowedEmails) ? allowedEmails : []
  const emailDomain = emailId.includes('@') ? emailId.substring(emailId.indexOf('@')) : ''

  for (const allowedEmail of allowedEmailsList) {
    if (typeof allowedEmail === 'string') {
      if (allowedEmail === emailId) return true
      if (emailDomain && allowedEmail.startsWith('@') && emailDomain === allowedEmail) return true
    }
  }
  return false
}

/**
 * Fetches active chats with their workflow and author metadata.
 *
 * This is intentionally shared across tabs to keep the same join strategy:
 * - Joins workflow + author email
 * - Excludes chats tied to active webhooks or active schedules
 */
async function fetchAgentChats(whereConditions: SQL<unknown> | undefined): Promise<AgentChatRow[]> {
  /**
   * `whereConditions` is a Drizzle SQL expression assembled by the caller.
   * Keeping this typed as `SQL<unknown>` avoids leaking complex query generics throughout the file,
   * while still retaining type-safety (no `any`) at the boundary.
   */
  return await db
    .select({
      chatId: chat.id,
      title: chat.title,
      workflowId: chat.workflowId,
      allowedEmails: chat.allowedEmails,
      department: chat.department,
      createdAt: chat.createdAt,
      workflowName: workflow.name,
      workspaceId: workflow.workspaceId,
      authorEmail: user.email,
      description: chat.description,
    })
    .from(chat)
    .innerJoin(workflow, eq(chat.workflowId, workflow.id))
    .innerJoin(user, eq(workflow.userId, user.id))
    .leftJoin(webhook, and(eq(webhook.workflowId, workflow.id), eq(webhook.isActive, true)))
    .leftJoin(
      workflowSchedule,
      and(eq(workflowSchedule.workflowId, workflow.id), eq(workflowSchedule.status, 'active'))
    )
    .where(whereConditions)
    .orderBy(desc(chat.updatedAt))
}

/**
 * Returns agents (chats) whose workflow was created by the user with the given email.
 * Creator is determined by workflow.userId, not chat.userId.
 */
async function getMyAgentsList(emailId: string): Promise<NextResponse> {
  const userRecord = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.email, emailId))
    .limit(1)

  if (userRecord.length === 0) {
    logger.warn(`User not found for myagents: ${emailId}`)
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
  }

  const creatorUserId = userRecord[0].id

  const chats = await fetchAgentChats(
    and(
      eq(chat.isActive, true),
      eq(workflow.userId, creatorUserId),
      isNull(webhook.id),
      isNull(workflowSchedule.id)
    )
  )

  /**
   * Core logic: for the "myagents" tab we keep the current behavior:
   * - Only return chats created by the current user
   * - And that are explicitly accessible via `allowedEmails` (exact email or domain pattern)
   */
  const accessibleChats = chats.filter((chatRecord) =>
    isMyAgentsChatAllowedByEmail(chatRecord.allowedEmails, emailId)
  )

  const agentList = accessibleChats.map((row) => toAgentListItem(row))

  logger.info(`agentsList (myagents): returning ${agentList.length} chats for ${emailId}`)

  return NextResponse.json({ success: true, agentList, count: agentList.length }, { status: 200 })
}

/**
 * Returns agents where emailId is in allowedEmails (exact or domain match) but NOT created by this user.
 * Same allowedEmails logic as myagents; excludes workflow.userId = current user.
 */
async function getSharedWithMeAgentsList(emailId: string): Promise<NextResponse> {
  const userRecord = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, emailId))
    .limit(1)

  if (userRecord.length === 0) {
    logger.warn(`User not found for sharedwithme: ${emailId}`)
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
  }
  const sharedWithMeUserId = userRecord[0].id

  const chats = await fetchAgentChats(
    and(
      eq(chat.isActive, true),
      ne(workflow.userId, sharedWithMeUserId),
      isNull(webhook.id),
      isNull(workflowSchedule.id)
    )
  )

  /**
   * Core logic: "sharedwithme" returns chats that the user can access via `allowedEmails`,
   * but excludes chats created by the user (so it doesn't overlap with "myagents").
   */
  const sharedChats = chats.filter((chatRecord) => {
    if (chatRecord.allowedEmails) {
      const allowedEmailsList = Array.isArray(chatRecord.allowedEmails)
        ? chatRecord.allowedEmails
        : []
      return allowedEmailsList.includes(emailId)
    }
    return false
  })

  const agentList = sharedChats.map((row) => toAgentListItem(row))

  logger.info(
    `agentsList (sharedwithme): returning ${agentList.length} chats for ${emailId} (in allowedEmails, not created by user)`
  )

  return NextResponse.json({ success: true, agentList, count: agentList.length }, { status: 200 })
}

/**
 * GET /api/chat/agentsList
 * Query: tabName=global — returns active chats whose allowedEmails contains any string starting with '@'.
 *        tabName=myagents — returns agents created by user or in allowedEmails; requires emailId.
 *        tabName=sharedwithme — returns agents where emailId is in allowedEmails (exact or domain) but NOT created by this user; requires emailId.
 * Optional for global: departmentName — filters by department.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request, 'Schedule execution')
  if (authError) {
    return authError
  }

  try {
    const { searchParams } = new URL(request.url)
    const tabName = searchParams.get('tabName')
    const emailId = searchParams.get('emailId')

    if (tabName === 'myagents') {
      if (!emailId?.trim()) {
        return NextResponse.json(
          { success: false, error: 'emailId is required when tabName=myagents' },
          { status: 400 }
        )
      }
      return await getMyAgentsList(emailId.trim())
    }

    if (tabName === 'sharedwithme') {
      if (!emailId?.trim()) {
        return NextResponse.json(
          { success: false, error: 'emailId is required when tabName=sharedwithme' },
          { status: 400 }
        )
      }
      return await getSharedWithMeAgentsList(emailId.trim())
    }

    if (tabName === 'global') {
      const departmentName = searchParams.get('departmentName')
      const departmentValue = resolveDepartmentValue(departmentName)

      const whereConditions =
        departmentValue !== undefined
          ? and(
              eq(chat.isActive, true),
              eq(chat.department, departmentValue),
              isNull(webhook.id),
              isNull(workflowSchedule.id)
            )
          : and(eq(chat.isActive, true), isNull(webhook.id), isNull(workflowSchedule.id))

      const chats = await fetchAgentChats(whereConditions)

      const agentList = chats
        .filter((row) => hasAllowedEmailStartingWithAtSymbol(row.allowedEmails))
        .map((row) => toAgentListItem(row))

      logger.info(`agentsList: returning ${agentList.length} global agent chats`)

      return NextResponse.json(
        { success: true, agentList, count: agentList.length },
        { status: 200 }
      )
    }

    return NextResponse.json({ success: true, agentList: [], count: 0 }, { status: 200 })
  } catch (error: unknown) {
    logger.error('Error fetching agents list:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    )
  }
}

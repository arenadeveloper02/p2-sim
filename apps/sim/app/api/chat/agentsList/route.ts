import { db } from '@sim/db'
import {
  chat,
  user,
  webhook,
  workflow,
  workflowExecutionLogs,
  workflowSchedule,
} from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import type { SQL } from 'drizzle-orm'
import { and, desc, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm'
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
  identifier?: string | null
}

/**
 * Returns true when allowedEmails has at least one string whose first character is '@'
 * (e.g. '@position2.com', '@northstar'). Ignores email-style entries (e.g. saiteja.s@position2.com).
 */
function hasAllowedEmailStartingWithAtSymbol(
  allowedEmails: unknown,
  userEmailDomain: string
): boolean {
  const list = Array.isArray(allowedEmails) ? allowedEmails : []
  const commonEmailDomains = ['@gmail.com', '@yahoo.com', '@hotmail.com', '@outlook.com']
  return list.some(
    (entry) => typeof entry === 'string' && entry.length > 0 && entry.startsWith(userEmailDomain) && !commonEmailDomains.includes(userEmailDomain)
  )
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
    title: row.title,
    author_email: row.authorEmail,
    workflow_id: row.workflowId,
    workflow_name: row.workflowName,
    workspace_id: row.workspaceId,
    department: toDepartmentLabel(row.department),
    created_at: row.createdAt.toISOString(),
    workflow_description: row.description,
    status: 'published',
    identifier: row.identifier,
    redirect_url: `${getBaseUrl()}/chat/${row.identifier || row.workflowId}?workspaceId=${row.workspaceId}`,
    // allowedEmails: row.allowedEmails,
  }
}

type AgentListItem = ReturnType<typeof toAgentListItem>

/**
 * Returns execution log rows for the given workflowIds and userId, ordered by started_at desc.
 * Deduplicated by workflowId so each workflow appears once (most recent first).
 */
async function getRecentUsedAgentsFromLogs(
  workflowIds: string[],
  userId: string
): Promise<{ workflowId: string; startedAt: Date }[]> {
  if (workflowIds.length === 0) return []
  const rows = await db
    .select({
      workflowId: workflowExecutionLogs.workflowId,
      startedAt: workflowExecutionLogs.startedAt,
    })
    .from(workflowExecutionLogs)
    .where(
      and(
        isNotNull(workflowExecutionLogs.chatId),
        eq(workflowExecutionLogs.userId, userId),
        inArray(workflowExecutionLogs.workflowId, workflowIds)
      )
    )
    .orderBy(desc(workflowExecutionLogs.startedAt))

  const seen = new Set<string>()
  const deduped: { workflowId: string; startedAt: Date }[] = []
  for (const row of rows) {
    if (row.workflowId && !seen.has(row.workflowId)) {
      seen.add(row.workflowId)
      deduped.push({ workflowId: row.workflowId, startedAt: row.startedAt })
    }
  }
  return deduped
}

/**
 * Sorts agent list so items match the order of workflow IDs (recently used first).
 * Items whose workflow_id is not in the order list are placed last.
 */
function sortAgentListByWorkflowOrder<T extends { workflow_id: string }>(
  agentList: T[],
  orderedWorkflowIds: string[]
): T[] {
  const orderMap = new Map(orderedWorkflowIds.map((id, i) => [id, i]))
  return [...agentList].sort((a, b) => {
    const aIdx = orderMap.get(a.workflow_id) ?? Number.MAX_SAFE_INTEGER
    const bIdx = orderMap.get(b.workflow_id) ?? Number.MAX_SAFE_INTEGER
    return aIdx - bIdx
  })
}

/**
 * Builds workflow ID order: recently used first, then remaining agents in stable order.
 */
async function sortAgentListByRecentUsage(
  agentList: AgentListItem[],
  userId: string
): Promise<AgentListItem[]> {
  const workflowIds = agentList.map((row) => row.workflow_id)
  const recentUsedAgents = await getRecentUsedAgentsFromLogs(workflowIds, userId)
  const orderedWorkflowIds = recentUsedAgents.map((r) => r.workflowId)
  for (const workflowId of workflowIds) {
    if (!orderedWorkflowIds.includes(workflowId)) {
      orderedWorkflowIds.push(workflowId)
    }
  }
  return sortAgentListByWorkflowOrder(agentList, orderedWorkflowIds)
}

/** Merges agent lists by chat id; later entries replace earlier ones for the same id. */
function mergeAgentListsById(...lists: AgentListItem[][]): AgentListItem[] {
  const byId = new Map<string, AgentListItem>()
  for (const list of lists) {
    for (const item of list) {
      byId.set(item.id, item)
    }
  }
  return Array.from(byId.values())
}

const getAgentsListAllowedEmail = (chats: AgentChatRow[], emailId: string) => {
  return chats.filter((chatRecord) => {
    if (chatRecord.allowedEmails) {
      const allowedEmailsList = Array.isArray(chatRecord.allowedEmails)
        ? chatRecord.allowedEmails
        : []
      return allowedEmailsList.includes(emailId)
    }
    return false
  })
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
      identifier: chat.identifier,
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
  const accessibleChats = getAgentsListAllowedEmail(chats, emailId)

  const agentList = await sortAgentListByRecentUsage(
    accessibleChats.map((row) => toAgentListItem(row)),
    creatorUserId
  )

  logger.info(`agentsList (myagents): returning ${agentList.length} chats for ${emailId}`)

  return NextResponse.json({ success: true, agentList, count: agentList.length }, { status: 200 })
}

/**
 * Returns chats shared with the user via allowedEmails (exact or domain match),
 * excluding workflows created by that user.
 *
 * @param departmentValue - When set, only chats in this department are returned.
 */
async function fetchSharedWithMeChats(
  emailId: string,
  userId: string,
  departmentValue?: string
): Promise<AgentChatRow[]> {
  const sharedWhereConditions =
    departmentValue !== undefined
      ? and(
          eq(chat.isActive, true),
          eq(chat.department, departmentValue),
          ne(workflow.userId, userId),
          isNull(webhook.id),
          isNull(workflowSchedule.id)
        )
      : and(
          eq(chat.isActive, true),
          ne(workflow.userId, userId),
          isNull(webhook.id),
          isNull(workflowSchedule.id)
        )

  const chats = await fetchAgentChats(sharedWhereConditions)

  return getAgentsListAllowedEmail(chats, emailId)
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

  const sharedChats = await fetchSharedWithMeChats(emailId, userRecord[0].id)
  const agentList = sharedChats.map((row) => toAgentListItem(row))

  logger.info(
    `agentsList (sharedwithme): returning ${agentList.length} chats for ${emailId} (in allowedEmails, not created by user)`
  )

  return NextResponse.json({ success: true, agentList, count: agentList.length }, { status: 200 })
}

/**
 * Returns global agents (domain-wide allowedEmails) combined with shared-with-me agents,
 * sorted by the requesting user's recent chat usage.
 */
async function getGlobalAgentsList(
  emailId: string,
  departmentValue: string | undefined
): Promise<NextResponse> {
  const userRecord = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, emailId))
    .limit(1)

  if (userRecord.length === 0) {
    logger.warn(`User not found for global: ${emailId}`)
    return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
  }

  const userId = userRecord[0].id

  const globalWhereConditions =
    departmentValue !== undefined
      ? and(
          eq(chat.isActive, true),
          eq(chat.department, departmentValue),
          isNull(webhook.id),
          isNull(workflowSchedule.id)
        )
      : and(eq(chat.isActive, true), isNull(webhook.id), isNull(workflowSchedule.id))
  const userEmailDomain = `@${emailId.split('@')[1]}`

  const globalChats = await fetchAgentChats(globalWhereConditions)
  const globalAgentList = globalChats
    .filter((row) => hasAllowedEmailStartingWithAtSymbol(row.allowedEmails, userEmailDomain))
    .map((row) => toAgentListItem(row))

  const sharedChats = await fetchSharedWithMeChats(emailId, userId, departmentValue)
  const sharedAgentList = sharedChats.map((row) => toAgentListItem(row))

  const mergedAgentList = mergeAgentListsById(globalAgentList, sharedAgentList)
  const agentList = await sortAgentListByRecentUsage(mergedAgentList, userId)

  logger.info(
    `agentsList (global): returning ${agentList.length} chats for ${emailId} (${globalAgentList.length} global + ${sharedAgentList.length} shared, deduped)`
  )

  return NextResponse.json({ success: true, agentList, count: agentList.length }, { status: 200 })
}

/**
 * GET /api/chat/agentsList
 * Query: tabName=global — returns global agents (domain allowedEmails) plus shared-with-me agents, sorted by recent usage; requires emailId.
 *        tabName=myagents — returns agents created by user or in allowedEmails; requires emailId.
 *        tabName=sharedwithme — returns agents where emailId is in allowedEmails (exact or domain) but NOT created by this user; requires emailId.
 * Optional for global: departmentName — filters both global and shared-with-me agents by department.
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
      if (!emailId?.trim()) {
        return NextResponse.json(
          { success: false, error: 'emailId is required when tabName=global' },
          { status: 400 }
        )
      }

      const departmentName = searchParams.get('departmentName')
      const departmentValue = resolveDepartmentValue(departmentName)

      return await getGlobalAgentsList(emailId.trim(), departmentValue)
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

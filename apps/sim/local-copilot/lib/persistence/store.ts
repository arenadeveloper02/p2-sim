import { db } from '@sim/db'
import {
  localCopilotAuditLogs,
  localCopilotConversations,
  localCopilotMessages,
  localCopilotPatches,
  localCopilotToolCalls,
} from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import { desc, eq, max } from 'drizzle-orm'
import type { LocalCopilotMessageContent, WorkflowPatch } from '@/local-copilot/lib/types'

const logger = createLogger('LocalCopilotPersistence')

export async function createConversation(params: {
  userId: string
  workspaceId: string
  workflowId?: string
  title?: string
  model: string
  provider: string
}): Promise<string> {
  const id = generateId()
  await db.insert(localCopilotConversations).values({
    id,
    userId: params.userId,
    workspaceId: params.workspaceId,
    workflowId: params.workflowId ?? null,
    title: params.title ?? 'Arena Copilot',
    model: params.model,
    provider: params.provider,
  })
  return id
}

export async function getConversation(conversationId: string, userId: string) {
  const [row] = await db
    .select()
    .from(localCopilotConversations)
    .where(eq(localCopilotConversations.id, conversationId))
    .limit(1)
  if (!row || row.userId !== userId) return null
  return row
}

export async function listConversations(userId: string, workflowId?: string) {
  const query = db
    .select()
    .from(localCopilotConversations)
    .where(eq(localCopilotConversations.userId, userId))
    .orderBy(desc(localCopilotConversations.updatedAt))

  const rows = await query
  return workflowId ? rows.filter((r) => r.workflowId === workflowId) : rows
}

export async function appendMessage(params: {
  conversationId: string
  role: 'user' | 'assistant' | 'system'
  content: LocalCopilotMessageContent
}): Promise<string> {
  const [maxSeq] = await db
    .select({ value: max(localCopilotMessages.seq) })
    .from(localCopilotMessages)
    .where(eq(localCopilotMessages.conversationId, params.conversationId))

  const seq = (maxSeq?.value ?? 0) + 1
  const id = generateId()

  await db.insert(localCopilotMessages).values({
    id,
    conversationId: params.conversationId,
    role: params.role,
    content: params.content,
    seq,
  })

  await db
    .update(localCopilotConversations)
    .set({ updatedAt: new Date() })
    .where(eq(localCopilotConversations.id, params.conversationId))

  return id
}

export async function getMessages(conversationId: string) {
  return db
    .select()
    .from(localCopilotMessages)
    .where(eq(localCopilotMessages.conversationId, conversationId))
    .orderBy(localCopilotMessages.seq)
}

export async function savePatch(params: {
  conversationId: string
  userId: string
  workflowId: string
  patch: WorkflowPatch
}): Promise<string> {
  const id = generateId()
  await db.insert(localCopilotPatches).values({
    id,
    conversationId: params.conversationId,
    userId: params.userId,
    workflowId: params.workflowId,
    summary: params.patch.summary,
    patch: params.patch,
    status: 'pending',
  })
  logger.info('Saved Arena Copilot patch', { patchId: id, workflowId: params.workflowId })
  return id
}

export async function getPatch(patchId: string, userId: string) {
  const [row] = await db
    .select()
    .from(localCopilotPatches)
    .where(eq(localCopilotPatches.id, patchId))
    .limit(1)
  if (!row || row.userId !== userId) return null
  return row
}

export async function recordToolCall(params: {
  conversationId: string
  messageId?: string
  toolCallId: string
  toolName: string
  arguments: Record<string, unknown>
  result?: unknown
  status?: string
}): Promise<void> {
  await db.insert(localCopilotToolCalls).values({
    id: generateId(),
    conversationId: params.conversationId,
    messageId: params.messageId ?? null,
    toolCallId: params.toolCallId,
    toolName: params.toolName,
    arguments: params.arguments,
    result: params.result ?? null,
    status: params.status ?? 'completed',
    completedAt: new Date(),
  })
}

export async function writeAuditLog(params: {
  userId: string
  workspaceId: string
  workflowId?: string
  conversationId?: string
  patchId?: string
  action: string
  summary?: string
  status?: 'success' | 'failure' | 'rejected'
  metadata?: Record<string, unknown>
}): Promise<void> {
  await db.insert(localCopilotAuditLogs).values({
    id: generateId(),
    userId: params.userId,
    workspaceId: params.workspaceId,
    workflowId: params.workflowId ?? null,
    conversationId: params.conversationId ?? null,
    patchId: params.patchId ?? null,
    action: params.action,
    summary: params.summary ?? null,
    status: params.status ?? 'success',
    metadata: params.metadata ?? {},
  })
}

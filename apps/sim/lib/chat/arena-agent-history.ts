import { db } from '@sim/db'
import { arenaAgentFeedback, arenaAgentMessage, arenaAgentThread } from '@sim/db/schema'
import { getPostgresErrorCode } from '@sim/utils/errors'
import { generateId } from '@sim/utils/id'
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm'

export interface ArenaAgentScope {
  arenaUserId: string
  publicUuid: string
  chatSlug: string
}

export interface ArenaAgentThreadRecord {
  id: string
  arenaUserId: string
  publicUuid: string
  chatSlug: string
  chatId: string
  title: string | null
  pinnedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ArenaAgentMessageRecord {
  id: string
  arenaUserId: string
  publicUuid: string
  chatSlug: string
  chatId: string
  role: 'user' | 'assistant'
  content: string
  executionId: string | null
  createdAt: string
}

export type ArenaAgentStoreError = {
  ok: false
  status: 404 | 409
  error: string
}

function isUniqueViolation(error: unknown): boolean {
  return getPostgresErrorCode(error) === '23505'
}

function toIso(value: Date): string {
  return value.toISOString()
}

function mapThread(row: {
  id: string
  arenaUserId: string
  publicUuid: string
  chatSlug: string
  chatId: string
  title: string | null
  pinnedAt: Date | null
  createdAt: Date
  updatedAt: Date
}): ArenaAgentThreadRecord {
  return {
    id: row.id,
    arenaUserId: row.arenaUserId,
    publicUuid: row.publicUuid,
    chatSlug: row.chatSlug,
    chatId: row.chatId,
    title: row.title,
    pinnedAt: row.pinnedAt ? toIso(row.pinnedAt) : null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  }
}

function activeThreadWhere(scope: ArenaAgentScope, chatId: string) {
  return and(
    eq(arenaAgentThread.arenaUserId, scope.arenaUserId),
    eq(arenaAgentThread.publicUuid, scope.publicUuid),
    eq(arenaAgentThread.chatSlug, scope.chatSlug),
    eq(arenaAgentThread.chatId, chatId),
    isNull(arenaAgentThread.archivedAt)
  )
}

async function findActiveThread(scope: ArenaAgentScope, chatId: string) {
  const [row] = await db
    .select()
    .from(arenaAgentThread)
    .where(activeThreadWhere(scope, chatId))
    .limit(1)
  return row ?? null
}

/**
 * Inserts a thread for one Arena user and dashboard. Repeating the same chat id
 * returns the existing open thread. An archived chat id is refused.
 */
export async function createArenaAgentThread(
  input: ArenaAgentScope & { chatId: string; title?: string }
): Promise<{ ok: true; thread: ArenaAgentThreadRecord } | ArenaAgentStoreError> {
  const now = new Date()
  try {
    const [created] = await db
      .insert(arenaAgentThread)
      .values({
        id: generateId(),
        arenaUserId: input.arenaUserId,
        publicUuid: input.publicUuid,
        chatSlug: input.chatSlug,
        chatId: input.chatId,
        title: input.title ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
    return { ok: true, thread: mapThread(created) }
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
  }

  const [existing] = await db
    .select()
    .from(arenaAgentThread)
    .where(
      and(
        eq(arenaAgentThread.arenaUserId, input.arenaUserId),
        eq(arenaAgentThread.publicUuid, input.publicUuid),
        eq(arenaAgentThread.chatSlug, input.chatSlug),
        eq(arenaAgentThread.chatId, input.chatId)
      )
    )
    .limit(1)

  if (!existing || existing.archivedAt) {
    return { ok: false, status: 409, error: 'Thread is archived' }
  }

  return { ok: true, thread: mapThread(existing) }
}

/**
 * Lists open threads for one Arena user on one dashboard, pinned first.
 */
export async function listArenaAgentThreads(
  scope: ArenaAgentScope
): Promise<ArenaAgentThreadRecord[]> {
  const rows = await db
    .select()
    .from(arenaAgentThread)
    .where(
      and(
        eq(arenaAgentThread.arenaUserId, scope.arenaUserId),
        eq(arenaAgentThread.publicUuid, scope.publicUuid),
        eq(arenaAgentThread.chatSlug, scope.chatSlug),
        isNull(arenaAgentThread.archivedAt)
      )
    )
    .orderBy(
      sql`CASE WHEN ${arenaAgentThread.pinnedAt} IS NULL THEN 1 ELSE 0 END`,
      desc(arenaAgentThread.pinnedAt),
      desc(arenaAgentThread.updatedAt)
    )

  return rows.map(mapThread)
}

export async function updateArenaAgentThread(
  input: ArenaAgentScope & { chatId: string; title?: string; pinned?: boolean }
): Promise<{ ok: true; thread: ArenaAgentThreadRecord } | ArenaAgentStoreError> {
  const updates: {
    updatedAt: Date
    title?: string
    pinnedAt?: Date | null
  } = { updatedAt: new Date() }

  if (input.title !== undefined) updates.title = input.title
  if (input.pinned !== undefined) updates.pinnedAt = input.pinned ? new Date() : null

  const [updated] = await db
    .update(arenaAgentThread)
    .set(updates)
    .where(activeThreadWhere(input, input.chatId))
    .returning()

  if (!updated) return { ok: false, status: 404, error: 'Thread not found' }
  return { ok: true, thread: mapThread(updated) }
}

export async function archiveArenaAgentThread(
  input: ArenaAgentScope & { chatId: string }
): Promise<{ ok: true } | ArenaAgentStoreError> {
  const now = new Date()
  const [updated] = await db
    .update(arenaAgentThread)
    .set({ archivedAt: now, updatedAt: now })
    .where(activeThreadWhere(input, input.chatId))
    .returning({ id: arenaAgentThread.id })

  if (!updated) return { ok: false, status: 404, error: 'Thread not found' }
  return { ok: true }
}

function mapMessage(row: {
  id: string
  arenaUserId: string
  publicUuid: string
  chatSlug: string
  chatId: string
  role: string
  content: string
  executionId: string | null
  createdAt: Date
}): ArenaAgentMessageRecord {
  return {
    id: row.id,
    arenaUserId: row.arenaUserId,
    publicUuid: row.publicUuid,
    chatSlug: row.chatSlug,
    chatId: row.chatId,
    role: row.role === 'assistant' ? 'assistant' : 'user',
    content: row.content,
    executionId: row.executionId,
    createdAt: toIso(row.createdAt),
  }
}

export async function listArenaAgentMessages(
  input: ArenaAgentScope & { chatId: string }
): Promise<{ ok: true; messages: ArenaAgentMessageRecord[] } | ArenaAgentStoreError> {
  const thread = await findActiveThread(input, input.chatId)
  if (!thread) return { ok: false, status: 404, error: 'Thread not found' }

  const rows = await db
    .select()
    .from(arenaAgentMessage)
    .where(
      and(
        eq(arenaAgentMessage.arenaUserId, input.arenaUserId),
        eq(arenaAgentMessage.publicUuid, input.publicUuid),
        eq(arenaAgentMessage.chatSlug, input.chatSlug),
        eq(arenaAgentMessage.chatId, input.chatId)
      )
    )
    .orderBy(asc(arenaAgentMessage.createdAt))

  return { ok: true, messages: rows.map(mapMessage) }
}

export async function createArenaAgentMessage(
  input: ArenaAgentScope & {
    chatId: string
    role: 'user' | 'assistant'
    content: string
    executionId?: string
  }
): Promise<{ ok: true; message: ArenaAgentMessageRecord } | ArenaAgentStoreError> {
  const thread = await findActiveThread(input, input.chatId)
  if (!thread) return { ok: false, status: 404, error: 'Thread not found' }

  const [created] = await db
    .insert(arenaAgentMessage)
    .values({
      id: generateId(),
      arenaUserId: input.arenaUserId,
      publicUuid: input.publicUuid,
      chatSlug: input.chatSlug,
      chatId: input.chatId,
      role: input.role,
      content: input.content,
      executionId: input.executionId ?? null,
      createdAt: new Date(),
    })
    .returning()

  await db
    .update(arenaAgentThread)
    .set({ updatedAt: new Date() })
    .where(eq(arenaAgentThread.id, thread.id))

  return { ok: true, message: mapMessage(created) }
}

/**
 * Stores like/comment feedback for an execution. `liked: null` removes it.
 */
export async function upsertArenaAgentFeedback(input: {
  arenaUserId: string
  publicUuid: string
  executionId: string
  liked: boolean | null
  comment?: string
}): Promise<void> {
  if (input.liked === null) {
    await db
      .delete(arenaAgentFeedback)
      .where(
        and(
          eq(arenaAgentFeedback.arenaUserId, input.arenaUserId),
          eq(arenaAgentFeedback.executionId, input.executionId)
        )
      )
    return
  }

  await db
    .insert(arenaAgentFeedback)
    .values({
      id: generateId(),
      arenaUserId: input.arenaUserId,
      publicUuid: input.publicUuid,
      executionId: input.executionId,
      liked: input.liked,
      comment: input.comment ?? null,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [arenaAgentFeedback.arenaUserId, arenaAgentFeedback.executionId],
      set: {
        publicUuid: input.publicUuid,
        liked: input.liked,
        comment: input.comment ?? null,
      },
    })
}

import { randomUUID } from 'crypto'
import { db } from '@sim/db'
import { document, knowledgeBase, permissions, userKnowledgeBase } from '@sim/db/schema'
import { and, count, eq, isNotNull, isNull, or } from 'drizzle-orm'
import type {
  ChunkingConfig,
  CreateKnowledgeBaseData,
  KnowledgeBaseWithCounts,
  UserKnowledgeBaseAccess,
} from '@/lib/knowledge/types'
import { createLogger } from '@/lib/logs/console/logger'
import { getUserEntityPermissions } from '@/lib/workspaces/permissions/utils'

const logger = createLogger('KnowledgeBaseService')

/**
 * Get knowledge bases that user has direct access to via user_knowledge_base table only
 * Filters by userId AND workspaceId (both must match)
 * Returns minimal data with default values for missing fields
 */
export async function getUserKnowledgeBaseAccess(
  userId: string,
  workspaceId: string | null,
  requestId: string
): Promise<UserKnowledgeBaseAccess[]> {
  const results = await db
    .select({
      id: userKnowledgeBase.knowledgeBaseIdRef,
      name: userKnowledgeBase.knowledgeBaseNameRef,
      userIdRef: userKnowledgeBase.userIdRef,
      userWorkspaceIdRef: userKnowledgeBase.userWorkspaceIdRef,
      kbWorkspaceIdRef: userKnowledgeBase.kbWorkspaceIdRef,
      createdAt: userKnowledgeBase.createdAt,
      updatedAt: userKnowledgeBase.updatedAt,
      docCount: count(document.id),
    })
    .from(userKnowledgeBase)
    .leftJoin(
      document,
      and(
        eq(document.knowledgeBaseId, userKnowledgeBase.knowledgeBaseIdRef),
        isNull(document.deletedAt)
      )
    )
    .where(
      and(
        isNull(userKnowledgeBase.deletedAt),
        eq(userKnowledgeBase.userIdRef, userId),
        workspaceId ? eq(userKnowledgeBase.userWorkspaceIdRef, workspaceId) : undefined
      )
    )
    .groupBy(
      userKnowledgeBase.id,
      userKnowledgeBase.knowledgeBaseIdRef,
      userKnowledgeBase.knowledgeBaseNameRef,
      userKnowledgeBase.userIdRef,
      userKnowledgeBase.userWorkspaceIdRef,
      userKnowledgeBase.kbWorkspaceIdRef,
      userKnowledgeBase.createdAt,
      userKnowledgeBase.updatedAt
    )
    .orderBy(userKnowledgeBase.createdAt)

  logger.info(
    `[${requestId}] Retrieved ${results.length} knowledge base access entries for user ${userId}`
  )

  // Return simplified user knowledge base access data
  return results.map((row) => ({
    id: row.id,
    name: row.name,
    workspaceId: row.kbWorkspaceIdRef || null,
    docCount: Number(row.docCount),
  }))
}

/**
 * Get knowledge bases that a user can access
 */
export async function getKnowledgeBases(
  userId: string,
  workspaceId?: string | null
): Promise<KnowledgeBaseWithCounts[]> {
  const knowledgeBasesWithCounts = await db
    .select({
      id: knowledgeBase.id,
      name: knowledgeBase.name,
      description: knowledgeBase.description,
      tokenCount: knowledgeBase.tokenCount,
      embeddingModel: knowledgeBase.embeddingModel,
      embeddingDimension: knowledgeBase.embeddingDimension,
      chunkingConfig: knowledgeBase.chunkingConfig,
      createdAt: knowledgeBase.createdAt,
      updatedAt: knowledgeBase.updatedAt,
      workspaceId: knowledgeBase.workspaceId,
      docCount: count(document.id),
    })
    .from(knowledgeBase)
    .leftJoin(
      document,
      and(eq(document.knowledgeBaseId, knowledgeBase.id), isNull(document.deletedAt))
    )
    .leftJoin(
      permissions,
      and(
        eq(permissions.entityType, 'workspace'),
        eq(permissions.entityId, knowledgeBase.workspaceId),
        eq(permissions.userId, userId)
      )
    )
    .where(
      and(
        isNull(knowledgeBase.deletedAt),
        workspaceId
          ? // When filtering by workspace
            or(
              // Knowledge bases belonging to the specified workspace (user must have workspace permissions)
              and(eq(knowledgeBase.workspaceId, workspaceId), isNotNull(permissions.userId)),
              // Fallback: User-owned knowledge bases without workspace (legacy)
              and(eq(knowledgeBase.userId, userId), isNull(knowledgeBase.workspaceId))
            )
          : // When not filtering by workspace, use original logic
            or(
              // User owns the knowledge base directly
              eq(knowledgeBase.userId, userId),
              // User has permissions on the knowledge base's workspace
              isNotNull(permissions.userId)
            )
      )
    )
    .groupBy(knowledgeBase.id)
    .orderBy(knowledgeBase.createdAt)

  return knowledgeBasesWithCounts.map((kb) => ({
    ...kb,
    chunkingConfig: kb.chunkingConfig as ChunkingConfig,
    docCount: Number(kb.docCount),
  }))
}

/**
 * Create a new knowledge base
 */
export async function createKnowledgeBase(
  data: CreateKnowledgeBaseData,
  requestId: string
): Promise<KnowledgeBaseWithCounts> {
  const kbId = randomUUID()
  const now = new Date()

  if (data.workspaceId) {
    const hasPermission = await getUserEntityPermissions(data.userId, 'workspace', data.workspaceId)
    if (hasPermission === null) {
      throw new Error('User does not have permission to create knowledge bases in this workspace')
    }
  }

  const newKnowledgeBase = {
    id: kbId,
    name: data.name,
    description: data.description ?? null,
    workspaceId: data.workspaceId ?? null,
    userId: data.userId,
    tokenCount: 0,
    embeddingModel: data.embeddingModel,
    embeddingDimension: data.embeddingDimension,
    chunkingConfig: data.chunkingConfig,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }

  await db.insert(knowledgeBase).values(newKnowledgeBase)

  // Create corresponding entry in user_knowledge_base table
  const userKbId = randomUUID()
  const userKbEntry = {
    id: userKbId,
    userIdRef: data.userId,
    userWorkspaceIdRef: data.workspaceId ?? '',
    knowledgeBaseIdRef: kbId,
    kbWorkspaceIdRef: data.workspaceId ?? '',
    knowledgeBaseNameRef: data.name,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }

  await db.insert(userKnowledgeBase).values(userKbEntry)

  logger.info(
    `[${requestId}] Created knowledge base: ${data.name} (${kbId}) and user_knowledge_base entry (${userKbId})`
  )

  return {
    id: kbId,
    name: data.name,
    description: data.description ?? null,
    tokenCount: 0,
    embeddingModel: data.embeddingModel,
    embeddingDimension: data.embeddingDimension,
    chunkingConfig: data.chunkingConfig,
    createdAt: now,
    updatedAt: now,
    workspaceId: data.workspaceId ?? null,
    docCount: 0,
  }
}

/**
 * Sync all knowledge bases from a workspace to user_knowledge_base for a specific user
 * This is called when a user is added to a workspace (e.g., via invitation)
 */
export async function syncWorkspaceKnowledgeBasesForUser(
  userId: string,
  workspaceId: string,
  requestId: string
): Promise<void> {
  const now = new Date()

  // Get ALL knowledge bases in the workspace (including deleted ones)
  const workspaceKBs = await db
    .select({
      id: knowledgeBase.id,
      name: knowledgeBase.name,
      workspaceId: knowledgeBase.workspaceId,
      deletedAt: knowledgeBase.deletedAt,
    })
    .from(knowledgeBase)
    .where(eq(knowledgeBase.workspaceId, workspaceId))

  if (workspaceKBs.length === 0) {
    logger.info(
      `[${requestId}] No knowledge bases found in workspace ${workspaceId} for user ${userId}`
    )
    return
  }

  // Get existing entries (including deleted ones)
  const existingEntries = await db
    .select({
      knowledgeBaseIdRef: userKnowledgeBase.knowledgeBaseIdRef,
      deletedAt: userKnowledgeBase.deletedAt,
    })
    .from(userKnowledgeBase)
    .where(
      and(
        eq(userKnowledgeBase.userIdRef, userId),
        eq(userKnowledgeBase.userWorkspaceIdRef, workspaceId)
      )
    )

  const existingKbMap = new Map(existingEntries.map((e) => [e.knowledgeBaseIdRef, e.deletedAt]))

  // Separate KBs into new entries and entries that need updating
  const entriesToInsert: Array<{
    id: string
    userIdRef: string
    userWorkspaceIdRef: string
    knowledgeBaseIdRef: string
    kbWorkspaceIdRef: string
    knowledgeBaseNameRef: string
    createdAt: Date
    updatedAt: Date
    deletedAt: Date | null
  }> = []

  const entriesToUpdate: Array<{
    knowledgeBaseIdRef: string
    deletedAt: Date | null
    updatedAt: Date
  }> = []

  for (const kb of workspaceKBs) {
    const existingDeletedAt = existingKbMap.get(kb.id)

    if (existingDeletedAt === undefined) {
      // New entry - create it with the same deletedAt status as the KB
      entriesToInsert.push({
        id: randomUUID(),
        userIdRef: userId,
        userWorkspaceIdRef: workspaceId,
        knowledgeBaseIdRef: kb.id,
        kbWorkspaceIdRef: workspaceId,
        knowledgeBaseNameRef: kb.name,
        createdAt: now,
        updatedAt: now,
        deletedAt: kb.deletedAt,
      })
    } else if (existingDeletedAt !== kb.deletedAt) {
      // Entry exists but deletedAt status doesn't match - update it
      entriesToUpdate.push({
        knowledgeBaseIdRef: kb.id,
        deletedAt: kb.deletedAt,
        updatedAt: now,
      })
    }
  }

  // Insert new entries
  if (entriesToInsert.length > 0) {
    await db.insert(userKnowledgeBase).values(entriesToInsert)
    logger.info(
      `[${requestId}] Created ${entriesToInsert.length} user_knowledge_base entries for user ${userId} in workspace ${workspaceId}`
    )
  }

  // Update existing entries that need their deletedAt status synced
  for (const update of entriesToUpdate) {
    await db
      .update(userKnowledgeBase)
      .set({
        deletedAt: update.deletedAt,
        updatedAt: update.updatedAt,
      })
      .where(
        and(
          eq(userKnowledgeBase.userIdRef, userId),
          eq(userKnowledgeBase.knowledgeBaseIdRef, update.knowledgeBaseIdRef),
          eq(userKnowledgeBase.userWorkspaceIdRef, workspaceId)
        )
      )
  }

  if (entriesToUpdate.length > 0) {
    logger.info(
      `[${requestId}] Updated ${entriesToUpdate.length} user_knowledge_base entries for user ${userId} in workspace ${workspaceId} to sync deletedAt status`
    )
  }

  if (entriesToInsert.length === 0 && entriesToUpdate.length === 0) {
    logger.info(
      `[${requestId}] All user_knowledge_base entries are already in sync for user ${userId} in workspace ${workspaceId}`
    )
  }
}

/**
 * Update a knowledge base
 */
export async function updateKnowledgeBase(
  knowledgeBaseId: string,
  updates: {
    name?: string
    description?: string
    workspaceId?: string | null
    chunkingConfig?: {
      maxSize: number
      minSize: number
      overlap: number
    }
  },
  requestId: string
): Promise<KnowledgeBaseWithCounts> {
  const now = new Date()
  const updateData: {
    updatedAt: Date
    name?: string
    description?: string | null
    workspaceId?: string | null
    chunkingConfig?: {
      maxSize: number
      minSize: number
      overlap: number
    }
    embeddingModel?: string
    embeddingDimension?: number
  } = {
    updatedAt: now,
  }

  if (updates.name !== undefined) updateData.name = updates.name
  if (updates.description !== undefined) updateData.description = updates.description
  if (updates.workspaceId !== undefined) updateData.workspaceId = updates.workspaceId
  if (updates.chunkingConfig !== undefined) {
    updateData.chunkingConfig = updates.chunkingConfig
    updateData.embeddingModel = 'text-embedding-3-small'
    updateData.embeddingDimension = 1536
  }

  await db.update(knowledgeBase).set(updateData).where(eq(knowledgeBase.id, knowledgeBaseId))

  const updatedKb = await db
    .select({
      id: knowledgeBase.id,
      name: knowledgeBase.name,
      description: knowledgeBase.description,
      tokenCount: knowledgeBase.tokenCount,
      embeddingModel: knowledgeBase.embeddingModel,
      embeddingDimension: knowledgeBase.embeddingDimension,
      chunkingConfig: knowledgeBase.chunkingConfig,
      createdAt: knowledgeBase.createdAt,
      updatedAt: knowledgeBase.updatedAt,
      workspaceId: knowledgeBase.workspaceId,
      docCount: count(document.id),
    })
    .from(knowledgeBase)
    .leftJoin(
      document,
      and(eq(document.knowledgeBaseId, knowledgeBase.id), isNull(document.deletedAt))
    )
    .where(eq(knowledgeBase.id, knowledgeBaseId))
    .groupBy(knowledgeBase.id)
    .limit(1)

  if (updatedKb.length === 0) {
    throw new Error(`Knowledge base ${knowledgeBaseId} not found`)
  }

  logger.info(`[${requestId}] Updated knowledge base: ${knowledgeBaseId}`)

  return {
    ...updatedKb[0],
    chunkingConfig: updatedKb[0].chunkingConfig as ChunkingConfig,
    docCount: Number(updatedKb[0].docCount),
  }
}

/**
 * Get a single knowledge base by ID
 */
export async function getKnowledgeBaseById(
  knowledgeBaseId: string
): Promise<KnowledgeBaseWithCounts | null> {
  const result = await db
    .select({
      id: knowledgeBase.id,
      name: knowledgeBase.name,
      description: knowledgeBase.description,
      tokenCount: knowledgeBase.tokenCount,
      embeddingModel: knowledgeBase.embeddingModel,
      embeddingDimension: knowledgeBase.embeddingDimension,
      chunkingConfig: knowledgeBase.chunkingConfig,
      createdAt: knowledgeBase.createdAt,
      updatedAt: knowledgeBase.updatedAt,
      workspaceId: knowledgeBase.workspaceId,
      docCount: count(document.id),
    })
    .from(knowledgeBase)
    .leftJoin(
      document,
      and(eq(document.knowledgeBaseId, knowledgeBase.id), isNull(document.deletedAt))
    )
    .where(and(eq(knowledgeBase.id, knowledgeBaseId), isNull(knowledgeBase.deletedAt)))
    .groupBy(knowledgeBase.id)
    .limit(1)

  if (result.length === 0) {
    return null
  }

  return {
    ...result[0],
    chunkingConfig: result[0].chunkingConfig as ChunkingConfig,
    docCount: Number(result[0].docCount),
  }
}

/**
 * Delete a knowledge base (soft delete)
 * Also soft deletes all corresponding entries in user_knowledge_base table
 */
export async function deleteKnowledgeBase(
  knowledgeBaseId: string,
  requestId: string
): Promise<void> {
  const now = new Date()

  // Soft delete the knowledge base
  await db
    .update(knowledgeBase)
    .set({
      deletedAt: now,
      updatedAt: now,
    })
    .where(eq(knowledgeBase.id, knowledgeBaseId))

  // Soft delete all corresponding user_knowledge_base entries
  await db
    .update(userKnowledgeBase)
    .set({
      deletedAt: now,
      updatedAt: now,
    })
    .where(eq(userKnowledgeBase.knowledgeBaseIdRef, knowledgeBaseId))

  logger.info(
    `[${requestId}] Soft deleted knowledge base and user_knowledge_base entries: ${knowledgeBaseId}`
  )
}

import { randomUUID } from 'crypto'
import { and, count, eq, isNotNull, isNull, or } from 'drizzle-orm'
import type {
  ChunkingConfig,
  CreateKnowledgeBaseData,
  KnowledgeBaseWithCounts,
  UserKnowledgeBaseAccess,
} from '@/lib/knowledge/types'
import { createLogger } from '@/lib/logs/console/logger'
import { getUserEntityPermissions } from '@/lib/permissions/utils'
import { db } from '@/db'
import { document, knowledgeBase, permissions, userKnowledgeBase, workspace } from '@/db/schema'

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
    .groupBy(
      knowledgeBase.id,
      knowledgeBase.name,
      knowledgeBase.description,
      knowledgeBase.tokenCount,
      knowledgeBase.embeddingModel,
      knowledgeBase.embeddingDimension,
      knowledgeBase.createdAt,
      knowledgeBase.updatedAt,
      knowledgeBase.workspaceId
    )
    .orderBy(knowledgeBase.createdAt)

  return knowledgeBasesWithCounts.map((kb) => ({
    ...kb,
    chunkingConfig: kb.chunkingConfig as ChunkingConfig,
    docCount: Number(kb.docCount),
  }))
}

/**
 * Sync user_knowledge_base entries for all users who should have access to a knowledge base
 * This includes:
 * 1. Users with permissions on the workspace (if KB has a workspace)
 * 2. Workspace owner (if KB has a workspace)
 * 3. KB creator (always included)
 */
async function syncUserKnowledgeBaseEntries(
  knowledgeBaseId: string,
  kbName: string,
  workspaceId: string | null,
  creatorId: string,
  requestId: string
): Promise<void> {
  const now = new Date()
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

  if (workspaceId) {
    // Get the knowledge base to check if it's deleted
    const kbData = await db
      .select({
        deletedAt: knowledgeBase.deletedAt,
      })
      .from(knowledgeBase)
      .where(eq(knowledgeBase.id, knowledgeBaseId))
      .limit(1)

    const kbDeletedAt = kbData[0]?.deletedAt || null

    // Get all users with permissions on the workspace
    const usersWithPermissions = await db
      .select({
        userId: permissions.userId,
      })
      .from(permissions)
      .where(and(eq(permissions.entityType, 'workspace'), eq(permissions.entityId, workspaceId)))

    // Get workspace owner
    const workspaceData = await db
      .select({
        ownerId: workspace.ownerId,
      })
      .from(workspace)
      .where(eq(workspace.id, workspaceId))
      .limit(1)

    const ownerId = workspaceData[0]?.ownerId

    // Collect all unique user IDs
    const userIds = new Set<string>()
    usersWithPermissions.forEach((p) => userIds.add(p.userId))
    if (ownerId) {
      userIds.add(ownerId)
    }
    // Always include the creator
    userIds.add(creatorId)

    // Create entries for all users
    for (const userId of userIds) {
      // Check if entry already exists (including deleted ones)
      const existing = await db
        .select({
          deletedAt: userKnowledgeBase.deletedAt,
        })
        .from(userKnowledgeBase)
        .where(
          and(
            eq(userKnowledgeBase.userIdRef, userId),
            eq(userKnowledgeBase.knowledgeBaseIdRef, knowledgeBaseId)
          )
        )
        .limit(1)

      if (existing.length === 0) {
        // New entry - create with same deletedAt status as KB
        entriesToInsert.push({
          id: randomUUID(),
          userIdRef: userId,
          userWorkspaceIdRef: workspaceId,
          knowledgeBaseIdRef: knowledgeBaseId,
          kbWorkspaceIdRef: workspaceId,
          knowledgeBaseNameRef: kbName,
          createdAt: now,
          updatedAt: now,
          deletedAt: kbDeletedAt,
        })
      } else if (existing[0].deletedAt !== kbDeletedAt) {
        // Entry exists but deletedAt status doesn't match - update it
        await db
          .update(userKnowledgeBase)
          .set({
            deletedAt: kbDeletedAt,
            updatedAt: now,
          })
          .where(
            and(
              eq(userKnowledgeBase.userIdRef, userId),
              eq(userKnowledgeBase.knowledgeBaseIdRef, knowledgeBaseId)
            )
          )
      }
    }
  } else {
    // Legacy KB without workspace - only creator has access
    // This is handled below in the main function
  }

  // Insert all entries in batch
  if (entriesToInsert.length > 0) {
    await db.insert(userKnowledgeBase).values(entriesToInsert)
    logger.info(
      `[${requestId}] Created ${entriesToInsert.length} user_knowledge_base entries for knowledge base ${knowledgeBaseId}`
    )
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
      `[${requestId}] All knowledge bases in workspace ${workspaceId} already have entries for user ${userId}`
    )
  }
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

  // Sync user_knowledge_base entries for all users with access
  if (data.workspaceId) {
    // For workspace-based KBs: create entries for all users with workspace access
    await syncUserKnowledgeBaseEntries(kbId, data.name, data.workspaceId, data.userId, requestId)
  } else {
    // For legacy KBs without workspace: only creator has access
    const userKbId = randomUUID()
    const userKbEntry = {
      id: userKbId,
      userIdRef: data.userId,
      userWorkspaceIdRef: '',
      knowledgeBaseIdRef: kbId,
      kbWorkspaceIdRef: '',
      knowledgeBaseNameRef: data.name,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await db.insert(userKnowledgeBase).values(userKbEntry)
    logger.info(
      `[${requestId}] Created knowledge base: ${data.name} (${kbId}) and user_knowledge_base entry (${userKbId}) for creator`
    )
  }

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
 * Update a knowledge base
 */
export async function updateKnowledgeBase(
  knowledgeBaseId: string,
  updates: {
    name?: string
    description?: string
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
  if (updates.chunkingConfig !== undefined) {
    updateData.chunkingConfig = updates.chunkingConfig
    updateData.embeddingModel = 'text-embedding-3-small'
    updateData.embeddingDimension = 1536
  }

  await db.update(knowledgeBase).set(updateData).where(eq(knowledgeBase.id, knowledgeBaseId))

  // If name was updated, sync it to user_knowledge_base entries
  if (updates.name !== undefined) {
    await db
      .update(userKnowledgeBase)
      .set({
        knowledgeBaseNameRef: updates.name,
        updatedAt: now,
      })
      .where(
        and(
          eq(userKnowledgeBase.knowledgeBaseIdRef, knowledgeBaseId),
          isNull(userKnowledgeBase.deletedAt)
        )
      )
  }

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

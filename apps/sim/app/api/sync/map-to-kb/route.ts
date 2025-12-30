import { randomUUID } from 'crypto'
import { db } from '@sim/db'
import { clientKnowledgeBaseMapping, knowledgeBase } from '@sim/db/schema'
import { and, eq, isNull, or } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkHybridAuth } from '@/lib/auth/hybrid'
import { createSingleDocument } from '@/lib/knowledge/documents/service'
import { getKnowledgeBases } from '@/lib/knowledge/service'
import { createLogger } from '@/lib/logs/console/logger'
import { checkKnowledgeBaseWriteAccess } from '@/app/api/knowledge/utils'

const logger = createLogger('MapToKBAPI')

const MapToKBSchema = z.object({
  clientName: z.string().min(1, 'Client name is required'),
  clientId: z.string().min(1, 'Client ID is required'),
  documentName: z.string().min(1, 'Document name is required').max(255, 'Document name too long'),
  documentType: z.enum(['json', 'txt'], {
    errorMap: () => ({ message: 'Document type must be either "json" or "txt"' }),
  }),
  content: z.string().min(1, 'Document content is required'),
  documentTags: z
    .array(
      z.object({
        tagName: z.string(),
        tagValue: z.string(),
        tagType: z.string().optional(),
      })
    )
    .optional(),
})

/**
 * Find knowledge base by matching client name to KB name (fallback)
 * Returns the first KB that matches (case-insensitive, exact or contains)
 * Includes workspaceId from the matched KB
 */
async function findKnowledgeBaseByName(
  userId: string,
  clientName: string,
  workspaceId?: string | null
): Promise<{ id: string; name: string; workspaceId: string | null } | null> {
  // Get all KBs user has access to
  const accessibleKBs = await getKnowledgeBases(userId, workspaceId)

  // Normalize client name for matching
  const normalizedClientName = clientName.trim().toLowerCase()

  // Try exact match first (case-insensitive)
  const exactMatch = accessibleKBs.find(
    (kb) => kb.name.trim().toLowerCase() === normalizedClientName
  )
  if (exactMatch) {
    return {
      id: exactMatch.id,
      name: exactMatch.name,
      workspaceId: exactMatch.workspaceId,
    }
  }

  // Try contains match (KB name contains client name)
  const containsMatch = accessibleKBs.find((kb) =>
    kb.name.trim().toLowerCase().includes(normalizedClientName)
  )
  if (containsMatch) {
    return {
      id: containsMatch.id,
      name: containsMatch.name,
      workspaceId: containsMatch.workspaceId,
    }
  }

  // Try reverse contains (client name contains KB name)
  const reverseMatch = accessibleKBs.find((kb) =>
    normalizedClientName.includes(kb.name.trim().toLowerCase())
  )
  if (reverseMatch) {
    return {
      id: reverseMatch.id,
      name: reverseMatch.name,
      workspaceId: reverseMatch.workspaceId,
    }
  }

  return null
}

/**
 * Find knowledge base using client-to-KB mapping table
 * Falls back to name matching if no mapping exists
 */
async function findKnowledgeBaseByClientName(
  userId: string,
  clientName: string,
  clientId: string,
  workspaceId?: string | null
): Promise<{ id: string; name: string; workspaceId: string | null } | null> {
  // Try mapping table first - prefer clientId lookup, fallback to clientName
  const mapping = await db
    .select({
      knowledgeBaseId: clientKnowledgeBaseMapping.knowledgeBaseId,
      workspaceId: clientKnowledgeBaseMapping.workspaceId,
    })
    .from(clientKnowledgeBaseMapping)
    .innerJoin(knowledgeBase, eq(knowledgeBase.id, clientKnowledgeBaseMapping.knowledgeBaseId))
    .where(
      and(
        // Try clientId first, then fallback to clientName
        or(
          eq(clientKnowledgeBaseMapping.clientId, clientId),
          eq(clientKnowledgeBaseMapping.clientName, clientName.trim())
        ),
        isNull(clientKnowledgeBaseMapping.deletedAt),
        isNull(knowledgeBase.deletedAt),
        // Filter by workspace if provided, or allow null workspace mappings
        workspaceId
          ? or(
              eq(clientKnowledgeBaseMapping.workspaceId, workspaceId),
              isNull(clientKnowledgeBaseMapping.workspaceId)
            )
          : undefined
      )
    )
    .limit(1)

  if (mapping.length > 0) {
    // Verify user has access to this KB
    const accessibleKBs = await getKnowledgeBases(userId, workspaceId)
    const accessibleKB = accessibleKBs.find((k) => k.id === mapping[0].knowledgeBaseId)

    if (accessibleKB) {
      return {
        id: accessibleKB.id,
        name: accessibleKB.name,
        workspaceId: accessibleKB.workspaceId,
      }
    }
  }

  // Fallback to name matching
  return await findKnowledgeBaseByName(userId, clientName, workspaceId)
}

/**
 * POST /api/sync/map-to-kb
 *
 * Maps client name to knowledge base and creates document
 * Authentication: X-API-Key header (workspace or personal API key)
 *
 * Request body:
 * {
 *   "clientName": "Acme Corp",
 *   "clientId": "client-123",
 *   "documentName": "Q1 Report - 2025",
 *   "documentType": "json",
 *   "content": "Document content here...",
 *   "documentTags": [{"tagName": "client", "tagValue": "Acme Corp"}]
 * }
 */
export async function POST(req: NextRequest) {
  const requestId = randomUUID().slice(0, 8)

  try {
    // Authenticate using API key
    const auth = await checkHybridAuth(req, { requireWorkflowId: false })
    if (!auth.success || !auth.userId) {
      logger.warn(`[${requestId}] Authentication failed: ${auth.error}`)
      return NextResponse.json({ error: auth.error || 'Unauthorized' }, { status: 401 })
    }

    const userId = auth.userId

    // Parse and validate request body
    const body = await req.json()
    const validation = MapToKBSchema.safeParse(body)

    if (!validation.success) {
      logger.warn(`[${requestId}] Invalid request body`, {
        errors: validation.error.errors,
      })
      return NextResponse.json(
        {
          error: 'Invalid request data',
          details: validation.error.errors.map((e) => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        },
        { status: 400 }
      )
    }

    const { clientName, clientId, documentName, documentType, content, documentTags } =
      validation.data

    logger.info(`[${requestId}] Map to KB request`, {
      userId,
      clientName,
      clientId,
      authType: auth.authType,
    })

    // Find KB using mapping table (with fallback to name matching)
    // Search across all accessible workspaces to find the KB
    // The KB's workspaceId will be used to ensure correct placement
    const matchedKB = await findKnowledgeBaseByClientName(userId, clientName, clientId, null)

    if (!matchedKB) {
      logger.warn(`[${requestId}] No knowledge base found for client name: ${clientName}`, {
        userId,
      })
      return NextResponse.json(
        {
          error: `No knowledge base found matching client name: ${clientName}`,
          suggestion:
            'Ensure a mapping exists in the client_knowledge_base_mapping table or the knowledge base name matches the client name',
        },
        { status: 404 }
      )
    }

    // Use workspaceId from the matched KB (this ensures we use the correct workspace)
    const workspaceId = matchedKB.workspaceId

    logger.info(`[${requestId}] Matched KB for client`, {
      clientName,
      clientId,
      kbId: matchedKB.id,
      kbName: matchedKB.name,
      kbWorkspaceId: matchedKB.workspaceId,
      finalWorkspaceId: workspaceId,
    })

    // Check KB write access
    const accessCheck = await checkKnowledgeBaseWriteAccess(matchedKB.id, userId)
    if (!accessCheck.hasAccess) {
      logger.warn(
        `[${requestId}] User ${userId} attempted to create document in unauthorized knowledge base ${matchedKB.id}`
      )
      return NextResponse.json({ error: 'Unauthorized access to knowledge base' }, { status: 403 })
    }

    // Prepare document data based on documentType
    const contentBytes = new TextEncoder().encode(content).length
    const utf8Bytes = new TextEncoder().encode(content)
    const base64Content =
      typeof Buffer !== 'undefined'
        ? Buffer.from(content, 'utf8').toString('base64')
        : btoa(String.fromCharCode(...utf8Bytes))

    // Determine file extension and MIME type
    const fileExtension = documentType === 'json' ? '.json' : '.txt'
    const mimeType = documentType === 'json' ? 'application/json' : 'text/plain'
    const dataUri = `data:${mimeType};base64,${base64Content}`

    // Ensure filename has correct extension
    const finalFilename = documentName.endsWith(fileExtension)
      ? documentName
      : `${documentName}${fileExtension}`

    // Process document tags if provided
    // Automatically add clientId and clientName as tags if not already present
    const tagsWithClient = documentTags ? [...documentTags] : []

    // Add clientId tag if not already present
    if (!tagsWithClient.some((tag) => tag.tagName === 'clientId')) {
      tagsWithClient.push({ tagName: 'clientId', tagValue: clientId })
    }

    // Add clientName tag if not already present
    if (!tagsWithClient.some((tag) => tag.tagName === 'clientName')) {
      tagsWithClient.push({ tagName: 'clientName', tagValue: clientName })
    }

    let documentTagsData: string | undefined
    if (tagsWithClient.length > 0) {
      documentTagsData = JSON.stringify(tagsWithClient)
    }

    // Create document in KB
    const newDocument = await createSingleDocument(
      {
        filename: finalFilename,
        fileUrl: dataUri,
        fileSize: contentBytes,
        mimeType: mimeType,
        ...(documentTagsData ? { documentTagsData } : {}),
      },
      matchedKB.id,
      requestId,
      userId
    )

    logger.info(`[${requestId}] Document created successfully`, {
      documentId: newDocument.id,
      knowledgeBaseId: matchedKB.id,
      knowledgeBaseName: matchedKB.name,
      filename: newDocument.filename,
      documentType,
      clientName,
      clientId,
    })

    return NextResponse.json(
      {
        success: true,
        document: {
          id: newDocument.id,
          filename: newDocument.filename,
          knowledgeBaseId: matchedKB.id,
          knowledgeBaseName: matchedKB.name,
          clientId,
          clientName,
          uploadedAt: newDocument.uploadedAt,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    logger.error(`[${requestId}] Error mapping to KB`, error)
    return NextResponse.json(
      {
        error: 'Failed to map client to knowledge base and create document',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    )
  }
}

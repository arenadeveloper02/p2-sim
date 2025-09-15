import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { getKnowledgeBaseById, updateKnowledgeBase, deleteKnowledgeBase } from '@/lib/knowledge/service'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'
import { getP2KnowledgeBaseStats, deleteP2KnowledgeBase } from '@/lib/p2-knowledge/service'
import { checkKnowledgeBaseAccess, checkKnowledgeBaseWriteAccess } from '@/app/api/knowledge/utils'

const logger = createLogger('P2KnowledgeBaseManagementAPI')

const UpdateP2KnowledgeBaseSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  description: z.string().optional(),
  chunkingConfig: z
    .object({
      maxSize: z.number().min(100).max(4000),
      minSize: z.number().min(1).max(2000),
      overlap: z.number().min(0).max(500),
    })
    .optional()
    .refine((data) => !data || data.minSize < data.maxSize, {
      message: 'Min chunk size must be less than max chunk size',
    }),
})

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = generateRequestId()
  const { id: knowledgeBaseId } = await params

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthorized P2 knowledge base access attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accessCheck = await checkKnowledgeBaseAccess(knowledgeBaseId, session.user.id)
    if (!accessCheck.hasAccess) {
      if ('notFound' in accessCheck && accessCheck.notFound) {
        return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const knowledgeBase = await getKnowledgeBaseById(knowledgeBaseId)
    if (!knowledgeBase) {
      return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 })
    }

    // Get P2 Knowledge base stats from Milvus
    let milvusStats = null
    try {
      milvusStats = await getP2KnowledgeBaseStats(knowledgeBaseId, requestId)
    } catch (milvusError) {
      logger.warn(`[${requestId}] Failed to get P2 Knowledge stats for knowledge base ${knowledgeBaseId}:`, milvusError)
    }

    return NextResponse.json({
      success: true,
      data: {
        ...knowledgeBase,
        type: 'p2-knowledge',
        milvusStats,
      },
    })
  } catch (error) {
    logger.error(`[${requestId}] Error fetching P2 knowledge base`, error)
    return NextResponse.json({ error: 'Failed to fetch knowledge base' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = generateRequestId()
  const { id: knowledgeBaseId } = await params

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthorized P2 knowledge base update attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accessCheck = await checkKnowledgeBaseWriteAccess(knowledgeBaseId, session.user.id)
    if (!accessCheck.hasAccess) {
      if ('notFound' in accessCheck && accessCheck.notFound) {
        return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await req.json()

    try {
      const validatedData = UpdateP2KnowledgeBaseSchema.parse(body)

      const updates: {
        name?: string
        description?: string
        chunkingConfig?: {
          maxSize: number
          minSize: number
          overlap: number
        }
      } = {}

      if (validatedData.name !== undefined) updates.name = validatedData.name
      if (validatedData.description !== undefined) updates.description = validatedData.description
      if (validatedData.chunkingConfig !== undefined) updates.chunkingConfig = validatedData.chunkingConfig

      const updatedKnowledgeBase = await updateKnowledgeBase(knowledgeBaseId, updates, requestId)

      logger.info(`[${requestId}] P2 Knowledge base updated: ${knowledgeBaseId}`)

      return NextResponse.json({
        success: true,
        data: {
          ...updatedKnowledgeBase,
          type: 'p2-knowledge',
        },
      })
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        logger.warn(`[${requestId}] Invalid P2 knowledge base update data`, {
          errors: validationError.errors,
        })
        return NextResponse.json(
          { error: 'Invalid request data', details: validationError.errors },
          { status: 400 }
        )
      }
      throw validationError
    }
  } catch (error) {
    logger.error(`[${requestId}] Error updating P2 knowledge base`, error)
    return NextResponse.json({ error: 'Failed to update knowledge base' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = generateRequestId()
  const { id: knowledgeBaseId } = await params

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthorized P2 knowledge base deletion attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accessCheck = await checkKnowledgeBaseWriteAccess(knowledgeBaseId, session.user.id)
    if (!accessCheck.hasAccess) {
      if ('notFound' in accessCheck && accessCheck.notFound) {
        return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 })
      }
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Delete from database
    await deleteKnowledgeBase(knowledgeBaseId, requestId)

    // Delete P2 Knowledge base and Milvus collection
    try {
      await deleteP2KnowledgeBase(knowledgeBaseId, requestId)
      logger.info(`[${requestId}] P2 Knowledge base deleted from database and Milvus: ${knowledgeBaseId}`)
    } catch (milvusError) {
      logger.error(`[${requestId}] Failed to delete P2 Knowledge base ${knowledgeBaseId}:`, milvusError)
      // Don't fail the entire operation, just log the error
    }

    logger.info(`[${requestId}] P2 Knowledge base deleted: ${knowledgeBaseId}`)

    return NextResponse.json({
      success: true,
      data: { id: knowledgeBaseId },
    })
  } catch (error) {
    logger.error(`[${requestId}] Error deleting P2 knowledge base`, error)
    return NextResponse.json({ error: 'Failed to delete knowledge base' }, { status: 500 })
  }
}

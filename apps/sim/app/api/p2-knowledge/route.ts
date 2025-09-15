import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { createKnowledgeBase, getKnowledgeBases } from '@/lib/knowledge/service'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'
import { createP2KnowledgeBase } from '@/lib/p2-knowledge/service'

const logger = createLogger('P2KnowledgeBaseAPI')

const CreateP2KnowledgeBaseSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  workspaceId: z.string().optional(),
  embeddingModel: z.literal('text-embedding-3-small').default('text-embedding-3-small'),
  embeddingDimension: z.literal(1536).default(1536),
  chunkingConfig: z
    .object({
      maxSize: z.number().min(100).max(4000).default(1024),
      minSize: z.number().min(1).max(2000).default(1),
      overlap: z.number().min(0).max(500).default(200),
    })
    .default({
      maxSize: 1024,
      minSize: 1,
      overlap: 200,
    })
    .refine((data) => data.minSize < data.maxSize, {
      message: 'Min chunk size must be less than max chunk size',
    }),
})

export async function GET(req: NextRequest) {
  const requestId = generateRequestId()

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthorized P2 knowledge base access attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    // Get knowledge bases from the database (same as regular knowledge)
    const knowledgeBasesWithCounts = await getKnowledgeBases(session.user.id, workspaceId)

    // Filter to only show P2 knowledge bases (we can add a flag or prefix to identify them)
    // For now, we'll return all knowledge bases and let the frontend filter
    const p2KnowledgeBases = knowledgeBasesWithCounts.map(kb => ({
      ...kb,
      type: 'p2-knowledge', // Add type identifier
    }))

    return NextResponse.json({
      success: true,
      data: p2KnowledgeBases,
    })
  } catch (error) {
    logger.error(`[${requestId}] Error fetching P2 knowledge bases`, error)
    return NextResponse.json({ error: 'Failed to fetch knowledge bases' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const requestId = generateRequestId()

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthorized P2 knowledge base creation attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()

    try {
      const validatedData = CreateP2KnowledgeBaseSchema.parse(body)

      const createData = {
        ...validatedData,
        userId: session.user.id,
      }

      // Create knowledge base in the database (same as regular knowledge)
      const newKnowledgeBase = await createKnowledgeBase(createData, requestId)

      // Create corresponding Milvus collection and ensure it's properly initialized
      try {
        await createP2KnowledgeBase(newKnowledgeBase.id, requestId)
        logger.info(`[${requestId}] Successfully created P2 Knowledge base with Milvus: ${newKnowledgeBase.id}`)
      } catch (milvusError) {
        logger.error(`[${requestId}] Failed to create Milvus collection for knowledge base ${newKnowledgeBase.id}:`, milvusError)
        // For P2 Knowledge, Milvus is critical - fail the operation if collection creation fails
        return NextResponse.json(
          { 
            error: 'Failed to initialize Milvus collection', 
            details: milvusError instanceof Error ? milvusError.message : 'Unknown error'
          }, 
          { status: 500 }
        )
      }

      logger.info(
        `[${requestId}] P2 Knowledge base created: ${newKnowledgeBase.id} for user ${session.user.id}`
      )

      return NextResponse.json({
        success: true,
        data: {
          ...newKnowledgeBase,
          type: 'p2-knowledge', // Add type identifier
        },
      })
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        logger.warn(`[${requestId}] Invalid P2 knowledge base data`, {
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
    logger.error(`[${requestId}] Error creating P2 knowledge base`, error)
    return NextResponse.json({ error: 'Failed to create knowledge base' }, { status: 500 })
  }
}

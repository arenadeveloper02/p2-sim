import { randomUUID } from 'crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createLogger } from '@/lib/logs/console/logger'
import { getUserId } from '@/app/api/auth/oauth/utils'
import { checkKnowledgeBaseWriteAccess } from '@/app/api/knowledge/utils'
import { processChunkForP2Knowledge } from '@/lib/p2-knowledge/service'
import { estimateTokenCount } from '@/lib/tokenization/estimators'
import { calculateCost } from '@/providers/utils'

const logger = createLogger('P2KnowledgeChunksAPI')

const CreateChunkSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  enabled: z.boolean().default(true),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; documentId: string }> }
) {
  const requestId = randomUUID().slice(0, 8)
  const { id: knowledgeBaseId, documentId } = await params

  try {
    const body = await req.json()
    const { workflowId } = body

    logger.info(`[${requestId}] P2 Knowledge chunk creation request`, {
      knowledgeBaseId,
      documentId,
      workflowId,
      hasWorkflowId: !!workflowId,
    })

    const userId = await getUserId(requestId, workflowId)

    if (!userId) {
      const errorMessage = workflowId ? 'Workflow not found' : 'Unauthorized'
      const statusCode = workflowId ? 404 : 401
      logger.warn(`[${requestId}] Authentication failed: ${errorMessage}`, {
        workflowId,
        hasWorkflowId: !!workflowId,
      })
      return NextResponse.json({ error: errorMessage }, { status: statusCode })
    }

    const accessCheck = await checkKnowledgeBaseWriteAccess(knowledgeBaseId, userId)

    if (!accessCheck.hasAccess) {
      if ('notFound' in accessCheck && accessCheck.notFound) {
        logger.warn(`[${requestId}] Knowledge base not found: ${knowledgeBaseId}`)
        return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 })
      }
      logger.warn(
        `[${requestId}] User ${userId} attempted to create chunk in unauthorized knowledge base ${knowledgeBaseId}`
      )
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      const validatedData = CreateChunkSchema.parse(body)

      // Process chunk using P2 Knowledge service (handles Milvus operations)
      const result = await processChunkForP2Knowledge(
        knowledgeBaseId,
        documentId,
        validatedData.content,
        0, // chunkIndex
        {}, // tags
        requestId
      )

      // Calculate token count
      const tokenCount = estimateTokenCount(validatedData.content, 'openai')

      // Calculate cost
      let cost = null
      try {
        cost = calculateCost('text-embedding-3-small', tokenCount.count, 0, false)
      } catch (error) {
        logger.warn(`[${requestId}] Failed to calculate cost for chunk upload`, {
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }

      logger.info(`[${requestId}] Successfully created chunk ${result.chunkId} in P2 Knowledge base`)

      return NextResponse.json({
        success: true,
        data: {
          chunkId: result.chunkId,
          documentId: result.documentId,
          documentName: `Document ${result.documentId}`,
          content: result.content,
          tokenCount: tokenCount.count,
          enabled: validatedData.enabled,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...(cost
            ? {
                cost: {
                  input: cost.input,
                  output: cost.output,
                  total: cost.total,
                  tokens: {
                    prompt: tokenCount.count,
                    completion: 0,
                    total: tokenCount.count,
                  },
                  model: 'text-embedding-3-small',
                  pricing: cost.pricing,
                },
              }
            : {}),
        },
      })
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        logger.warn(`[${requestId}] Invalid chunk creation data`, {
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
    logger.error(`[${requestId}] Error creating P2 Knowledge chunk`, error)
    return NextResponse.json({ error: 'Failed to create chunk' }, { status: 500 })
  }
}

import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'
import { getUserId } from '@/app/api/auth/oauth/utils'
import { checkKnowledgeBaseAccess } from '@/app/api/knowledge/utils'
import { calculateCost } from '@/providers/utils'
import { searchP2Knowledge } from '@/lib/p2-knowledge/service'
import { estimateTokenCount } from '@/lib/tokenization/estimators'
import { getDocumentNamesByIds } from '@/app/api/knowledge/search/utils'

const logger = createLogger('P2KnowledgeSearchAPI')

const P2KnowledgeSearchSchema = z
  .object({
    knowledgeBaseIds: z.union([
      z.string().min(1, 'Knowledge base ID is required'),
      z.array(z.string().min(1)).min(1, 'At least one knowledge base ID is required'),
    ]),
    query: z
      .string()
      .optional()
      .nullable()
      .transform((val) => val || undefined),
    topK: z
      .number()
      .min(1)
      .max(100)
      .optional()
      .nullable()
      .default(10)
      .transform((val) => val ?? 10),
    filters: z
      .record(z.string())
      .optional()
      .nullable()
      .transform((val) => val || undefined),
  })
  .refine(
    (data) => {
      const hasQuery = data.query && data.query.trim().length > 0
      const hasFilters = data.filters && Object.keys(data.filters).length > 0
      return hasQuery || hasFilters
    },
    {
      message: 'Please provide either a search query or tag filters to search your knowledge base',
    }
  )

export async function POST(request: NextRequest) {
  const requestId = generateRequestId()

  try {
    const body = await request.json()
    const { workflowId, ...searchParams } = body

    const userId = await getUserId(requestId, workflowId)

    if (!userId) {
      const errorMessage = workflowId ? 'Workflow not found' : 'Unauthorized'
      const statusCode = workflowId ? 404 : 401
      return NextResponse.json({ error: errorMessage }, { status: statusCode })
    }

    try {
      const validatedData = P2KnowledgeSearchSchema.parse(searchParams)

      const knowledgeBaseIds = Array.isArray(validatedData.knowledgeBaseIds)
        ? validatedData.knowledgeBaseIds
        : [validatedData.knowledgeBaseIds]

      // Check access permissions
      const accessChecks = await Promise.all(
        knowledgeBaseIds.map((kbId) => checkKnowledgeBaseAccess(kbId, userId))
      )
      const accessibleKbIds: string[] = knowledgeBaseIds.filter(
        (_, idx) => accessChecks[idx]?.hasAccess
      )

      if (accessibleKbIds.length === 0) {
        return NextResponse.json(
          { error: 'Knowledge base not found or access denied' },
          { status: 404 }
        )
      }

      const hasQuery = validatedData.query && validatedData.query.trim().length > 0
      const hasFilters = validatedData.filters && Object.keys(validatedData.filters).length > 0

      let results: any[] = []

      if (!hasQuery && hasFilters) {
        // Tag-only search - use P2 Knowledge service
        logger.debug(`[${requestId}] Executing tag-only search with filters:`, validatedData.filters)
        results = await searchP2Knowledge(
          accessibleKbIds[0],
          '', // empty query for tag-only search
          validatedData.topK,
          validatedData.filters!,
          requestId
        )
      } else if (hasQuery && hasFilters) {
        // Tag + Vector search - use P2 Knowledge service
        logger.debug(`[${requestId}] Executing tag + vector search with filters:`, validatedData.filters)
        results = await searchP2Knowledge(
          accessibleKbIds[0],
          validatedData.query!,
          validatedData.topK,
          validatedData.filters!,
          requestId
        )
      } else if (hasQuery && !hasFilters) {
        // Vector-only search - use P2 Knowledge service
        logger.debug(`[${requestId}] Executing vector-only search`)
        results = await searchP2Knowledge(
          accessibleKbIds[0],
          validatedData.query!,
          validatedData.topK,
          undefined, // no tag filters
          requestId
        )
      } else {
        return NextResponse.json(
          {
            error: 'Please provide either a search query or tag filters to search your knowledge base',
          },
          { status: 400 }
        )
      }

      // Calculate cost for the embedding
      let cost = null
      let tokenCount = null
      if (hasQuery) {
        try {
          tokenCount = estimateTokenCount(validatedData.query!, 'openai')
          cost = calculateCost('text-embedding-3-small', tokenCount.count, 0, false)
        } catch (error) {
          logger.warn(`[${requestId}] Failed to calculate cost for search query`, {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }
      }

      // Fetch document names for the results
      const documentIds = results.map((result) => result.documentId)
      const documentNameMap = await getDocumentNamesByIds(documentIds)

      return NextResponse.json({
        success: true,
        data: {
          results: results.map((result) => ({
            documentId: result.documentId,
            documentName: documentNameMap[result.documentId] || undefined,
            content: result.content,
            chunkIndex: result.chunkIndex,
            metadata: {
              tag1: result.tag1,
              tag2: result.tag2,
              tag3: result.tag3,
              tag4: result.tag4,
              tag5: result.tag5,
              tag6: result.tag6,
              tag7: result.tag7,
            },
            similarity: hasQuery ? 1 - result.distance : 1,
          })),
          query: validatedData.query || '',
          knowledgeBaseIds: accessibleKbIds,
          knowledgeBaseId: accessibleKbIds[0],
          topK: validatedData.topK,
          totalResults: results.length,
          ...(cost && tokenCount
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
        return NextResponse.json(
          { error: 'Invalid request data', details: validationError.errors },
          { status: 400 }
        )
      }
      throw validationError
    }
  } catch (error) {
    logger.error(`[${requestId}] Error in P2 Knowledge search:`, error)
    return NextResponse.json(
      {
        error: 'Failed to perform P2 Knowledge search',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

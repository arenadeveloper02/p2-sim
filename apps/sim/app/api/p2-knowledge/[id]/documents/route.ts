import { randomUUID } from 'crypto'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { createLogger } from '@/lib/logs/console/logger'
import { getUserId } from '@/app/api/auth/oauth/utils'
import { checkKnowledgeBaseWriteAccess } from '@/app/api/knowledge/utils'
import { processDocumentForP2Knowledge } from '@/lib/p2-knowledge/service'
import { estimateTokenCount } from '@/lib/tokenization/estimators'
import { calculateCost } from '@/providers/utils'

const logger = createLogger('P2KnowledgeDocumentsAPI')

const CreateDocumentSchema = z.object({
  filename: z.string().min(1, 'Filename is required'),
  fileUrl: z.string().url('File URL must be valid'),
  fileSize: z.number().min(1, 'File size must be greater than 0'),
  mimeType: z.string().min(1, 'MIME type is required'),
  tag1: z.string().optional(),
  tag2: z.string().optional(),
  tag3: z.string().optional(),
  tag4: z.string().optional(),
  tag5: z.string().optional(),
  tag6: z.string().optional(),
  tag7: z.string().optional(),
  documentTagsData: z.string().optional(),
})

const BulkCreateDocumentsSchema = z.object({
  documents: z.array(CreateDocumentSchema),
  processingOptions: z.object({
    chunkSize: z.number().min(100).max(4000),
    minCharactersPerChunk: z.number().min(1).max(2000),
    recipe: z.string(),
    lang: z.string(),
    chunkOverlap: z.number().min(0).max(500),
  }),
  bulk: z.literal(true),
})

// Simple text chunker for P2 Knowledge
function chunkText(text: string, chunkSize: number = 1024, overlap: number = 200): string[] {
  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    let chunk = text.slice(start, end)

    // Try to break at sentence boundaries
    if (end < text.length) {
      const lastSentence = chunk.lastIndexOf('.')
      const lastNewline = chunk.lastIndexOf('\n')
      const breakPoint = Math.max(lastSentence, lastNewline)
      
      if (breakPoint > start + chunkSize * 0.5) {
        chunk = text.slice(start, start + breakPoint + 1)
      }
    }

    chunks.push(chunk.trim())
    start = start + chunk.length - overlap
  }

  return chunks.filter(chunk => chunk.length > 0)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = randomUUID().slice(0, 8)
  const { id: knowledgeBaseId } = await params

  try {
    const body = await req.json()
    const { workflowId } = body

    logger.info(`[${requestId}] P2 Knowledge base document creation request`, {
      knowledgeBaseId,
      workflowId,
      hasWorkflowId: !!workflowId,
      bodyKeys: Object.keys(body),
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
        `[${requestId}] User ${userId} attempted to create document in unauthorized knowledge base ${knowledgeBaseId}`
      )
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (body.bulk === true) {
      try {
        const validatedData = BulkCreateDocumentsSchema.parse(body)

        const createdDocuments = []

        for (const doc of validatedData.documents) {
          const documentId = randomUUID()
          
          // Decode content from data URI
          let content = ''
          if (doc.fileUrl.startsWith('data:')) {
            const base64Data = doc.fileUrl.split(',')[1]
            content = Buffer.from(base64Data, 'base64').toString('utf-8')
          } else {
            // For non-data URIs, we'd need to fetch the content
            // For now, we'll use the filename as placeholder content
            content = `Document: ${doc.filename}`
          }

          // Process document using P2 Knowledge service (handles Milvus operations)
          const result = await processDocumentForP2Knowledge(
            knowledgeBaseId,
            documentId,
            content,
            doc.filename,
            {
              maxSize: validatedData.processingOptions.chunkSize,
              minSize: 1,
              overlap: validatedData.processingOptions.chunkOverlap,
            },
            {
              tag1: doc.tag1,
              tag2: doc.tag2,
              tag3: doc.tag3,
              tag4: doc.tag4,
              tag5: doc.tag5,
              tag6: doc.tag6,
              tag7: doc.tag7,
            },
            requestId
          )

          createdDocuments.push({
            documentId: result.documentId,
            filename: result.filename,
            status: 'completed',
            chunkCount: result.chunkCount,
            embeddingCount: result.embeddingCount,
          })
        }

        logger.info(`[${requestId}] Successfully created ${createdDocuments.length} documents in P2 Knowledge base`)

        return NextResponse.json({
          success: true,
          data: {
            total: createdDocuments.length,
            documentsCreated: createdDocuments,
            processingMethod: 'milvus',
          },
        })
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          logger.warn(`[${requestId}] Invalid bulk processing request data`, {
            errors: validationError.errors,
          })
          return NextResponse.json(
            { error: 'Invalid request data', details: validationError.errors },
            { status: 400 }
          )
        }
        throw validationError
      }
    } else {
      // Handle single document creation
      try {
        const validatedData = CreateDocumentSchema.parse(body)

        const documentId = randomUUID()
        
        // Decode content from data URI
        let content = ''
        if (validatedData.fileUrl.startsWith('data:')) {
          const base64Data = validatedData.fileUrl.split(',')[1]
          content = Buffer.from(base64Data, 'base64').toString('utf-8')
        } else {
          content = `Document: ${validatedData.filename}`
        }

        // Process document using P2 Knowledge service (handles Milvus operations)
        const result = await processDocumentForP2Knowledge(
          knowledgeBaseId,
          documentId,
          content,
          validatedData.filename,
          {
            maxSize: 1024,
            minSize: 1,
            overlap: 200,
          },
          {
            tag1: validatedData.tag1,
            tag2: validatedData.tag2,
            tag3: validatedData.tag3,
            tag4: validatedData.tag4,
            tag5: validatedData.tag5,
            tag6: validatedData.tag6,
            tag7: validatedData.tag7,
          },
          requestId
        )

        return NextResponse.json({
          success: true,
          data: {
            documentId: result.documentId,
            filename: result.filename,
            chunkCount: result.chunkCount,
            status: 'completed',
          },
        })
      } catch (validationError) {
        if (validationError instanceof z.ZodError) {
          logger.warn(`[${requestId}] Invalid document data`, {
            errors: validationError.errors,
          })
          return NextResponse.json(
            { error: 'Invalid request data', details: validationError.errors },
            { status: 400 }
          )
        }
        throw validationError
      }
    }
  } catch (error) {
    logger.error(`[${requestId}] Error creating P2 Knowledge document`, error)
    return NextResponse.json({ error: 'Failed to create document' }, { status: 500 })
  }
}

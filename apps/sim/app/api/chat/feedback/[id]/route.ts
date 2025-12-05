import { db } from '@sim/db'
import { chatPromptFeedback, workflowExecutionLogs } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { createLogger } from '@/lib/logs/console/logger'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'

const logger = createLogger('ChatFeedbackAPI')

// Define validation schema for feedback request body
const feedbackSchema = z.object({
  comment: z.string().optional(),
  inComplete: z.boolean().default(false),
  inAccurate: z.boolean().default(false),
  outOfDate: z.boolean().default(false),
  tooLong: z.boolean().default(false),
  tooShort: z.boolean().default(false),
  liked: z.boolean().default(false),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession()
    const executionId = (await params).id

    if (!session) {
      return createErrorResponse('Unauthorized', 401)
    }

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized - no active session' }, { status: 401 })
    }

    // Parse and validate request body
    const body = feedbackSchema.parse(await request.json())

    try {
      // Check if subdomain is available
      const workflowExectution = await db
        .select()
        .from(workflowExecutionLogs)
        .where(eq(workflowExecutionLogs.executionId, executionId))
        .limit(1)

      if (workflowExectution.length === 0) {
        return createErrorResponse('Invalid execution Id', 400)
      }

      // Create the chat deployment
      const id = uuidv4()

      await db.insert(chatPromptFeedback).values({
        id,
        userId: session.user.id,
        executionId,
        workflowId: workflowExectution[0].workflowId,
        comment: body.comment,
        inComplete: body.inComplete,
        inAccurate: body.inAccurate,
        outOfDate: body.outOfDate,
        tooLong: body.tooLong,
        tooShort: body.tooShort,
        liked: body.liked,
        createdAt: new Date(),
        updatedAt: new Date(),
      })

      // Return successful response with chat URL
      return createSuccessResponse({
        id,
        message: 'Chat Prompt Feedback created successfully',
      })
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        const errorMessage = validationError.errors[0]?.message || 'Invalid request data'
        return createErrorResponse(errorMessage, 400, 'VALIDATION_ERROR')
      }
      throw validationError
    }
  } catch (error: any) {
    logger.error('Error creating chat deployment:', error)
    return createErrorResponse(error.message || 'Failed to create chat deployment', 500)
  }
}

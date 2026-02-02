import { db } from '@sim/db'
import { chat, workflowQueries } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { isDev } from '@/lib/core/config/feature-flags'
import { encryptSecret } from '@/lib/core/security/encryption'
import { getBaseUrl } from '@/lib/core/utils/urls'
import { deployWorkflow } from '@/lib/workflows/persistence/utils'
import { checkWorkflowAccessForChatCreation } from '@/app/api/chat/utils'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'

const logger = createLogger('ChatAPI')

const chatSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  identifier: z
    .string()
    .min(1, 'Identifier is required')
    .regex(/^[a-z0-9-]+$/, 'Identifier can only contain lowercase letters, numbers, and hyphens'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  remarks: z.string().optional(),
  department: z.string().optional(),
  customizations: z.object({
    primaryColor: z.string(),
    welcomeMessage: z.string(),
    imageUrl: z.string().optional(),
    goldenQueries: z.array(z.string()).optional(),
  }),
  authType: z.enum(['public', 'password', 'email', 'sso']).default('public'),
  password: z.string().optional(),
  allowedEmails: z.array(z.string()).optional().default([]),
  outputConfigs: z
    .array(
      z.object({
        blockId: z.string(),
        path: z.string(),
      })
    )
    .optional()
    .default([]),
})

const sanitizeGoldenQueries = (queries?: string[]) => {
  if (!Array.isArray(queries)) return []
  return queries.map((query) => query.trim()).filter((query) => query.length > 0)
}

async function replaceWorkflowQueries({
  workflowId,
  userId,
  queries,
}: {
  workflowId: string
  userId: string
  queries: string[]
}) {
  await db.transaction(async (tx) => {
    await tx
      .update(workflowQueries)
      .set({ deleted: true, updatedAt: new Date() })
      .where(and(eq(workflowQueries.workflowId, workflowId), eq(workflowQueries.deleted, false)))

    if (queries.length === 0) return

    await tx.insert(workflowQueries).values(
      queries.map((query, index) => ({
        id: uuidv4(),
        userId,
        workflowId,
        query,
        priority: index,
      }))
    )
  })
}

export async function GET(request: NextRequest) {
  try {
    const session = await getSession()

    if (!session) {
      return createErrorResponse('Unauthorized', 401)
    }

    // Get the user's chat deployments
    const deployments = await db.select().from(chat).where(eq(chat.userId, session.user.id))

    return createSuccessResponse({ deployments })
  } catch (error: any) {
    logger.error('Error fetching chat deployments:', error)
    return createErrorResponse(error.message || 'Failed to fetch chat deployments', 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()

    if (!session) {
      return createErrorResponse('Unauthorized', 401)
    }

    const body = await request.json()

    try {
      const validatedData = chatSchema.parse(body)

      // Extract validated data
      const {
        workflowId,
        identifier,
        title,
        description = '',
        remarks = '',
        department = '',
        customizations,
        authType = 'public',
        password,
        allowedEmails = [],
        outputConfigs = [],
      } = validatedData

      // Perform additional validation specific to auth types
      if (authType === 'password' && !password) {
        return createErrorResponse('Password is required when using password protection', 400)
      }

      if (authType === 'email' && (!Array.isArray(allowedEmails) || allowedEmails.length === 0)) {
        return createErrorResponse(
          'At least one email or domain is required when using email access control',
          400
        )
      }

      if (authType === 'sso' && (!Array.isArray(allowedEmails) || allowedEmails.length === 0)) {
        return createErrorResponse(
          'At least one email or domain is required when using SSO access control',
          400
        )
      }

      // Check if identifier is already in use by an active chat
      const existingChat = await db
        .select()
        .from(chat)
        .where(eq(chat.identifier, identifier))
        .limit(1)

      if (existingChat.length > 0) {
        const existing = existingChat[0]
        // If chat is active, identifier is already in use
        if (existing.isActive) {
          return createErrorResponse('Identifier already in use', 400)
        }
        // If chat is inactive, we'll update it instead of creating a new one
        logger.info(
          `Found inactive chat with identifier ${identifier}, will update instead of creating new`
        )
      }

      // Check if user has permission to create chat for this workflow
      const { hasAccess, workflow: workflowRecord } = await checkWorkflowAccessForChatCreation(
        workflowId,
        session.user.id
      )

      if (!hasAccess || !workflowRecord) {
        return createErrorResponse('Workflow not found or access denied', 404)
      }

      // Always deploy/redeploy the workflow to ensure latest version
      const result = await deployWorkflow({
        workflowId,
        deployedBy: session.user.id,
      })

      if (!result.success) {
        return createErrorResponse(result.error || 'Failed to deploy workflow', 500)
      }

      logger.info(
        `${workflowRecord.isDeployed ? 'Redeployed' : 'Auto-deployed'} workflow ${workflowId} for chat (v${result.version})`
      )

      // Encrypt password if provided
      let encryptedPassword = null
      if (authType === 'password' && password) {
        const { encrypted } = await encryptSecret(password)
        encryptedPassword = encrypted
      }

      // Merge customizations with the additional fields
      const mergedCustomizations = {
        ...(customizations || {}),
        primaryColor: customizations?.primaryColor || 'var(--brand-primary-hover-hex)',
        welcomeMessage: customizations?.welcomeMessage || 'Hi there! How can I help you today?',
      }
      const goldenQueries = sanitizeGoldenQueries(customizations?.goldenQueries)

      // Determine chat ID - use existing if updating, generate new if creating
      let chatId: string

      // If inactive chat exists, update it; otherwise create new
      if (existingChat.length > 0 && !existingChat[0].isActive) {
        const existing = existingChat[0]
        chatId = existing.id

        logger.info('Updating inactive chat deployment with values:', {
          chatId,
          workflowId,
          identifier,
          title,
          authType,
          hasPassword: !!encryptedPassword,
          emailCount: allowedEmails?.length || 0,
          outputConfigsCount: outputConfigs.length,
        })

        await db
          .update(chat)
          .set({
            workflowId,
            userId: session.user.id,
            identifier,
            title,
            description: description || '',
            remarks: remarks || '',
            department: department || '',
            customizations: mergedCustomizations,
            isActive: true,
            authType,
            password: encryptedPassword,
            allowedEmails: authType === 'email' || authType === 'sso' ? allowedEmails : [],
            outputConfigs,
            updatedAt: new Date(),
          })
          .where(eq(chat.id, chatId))
      } else {
        // Create the chat deployment
        chatId = uuidv4()

        logger.info('Creating chat deployment with values:', {
          workflowId,
          identifier,
          title,
          authType,
          hasPassword: !!encryptedPassword,
          emailCount: allowedEmails?.length || 0,
          outputConfigsCount: outputConfigs.length,
        })

        await db.insert(chat).values({
          id: chatId,
          workflowId,
          userId: session.user.id,
          identifier,
          title,
          description: description || '',
          remarks: remarks || '',
          department: department || '',
          customizations: mergedCustomizations,
          isActive: true,
          authType,
          password: encryptedPassword,
          allowedEmails: authType === 'email' || authType === 'sso' ? allowedEmails : [],
          outputConfigs,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      }

      if (goldenQueries.length > 0 || customizations?.goldenQueries) {
        await replaceWorkflowQueries({
          workflowId,
          userId: session.user.id,
          queries: goldenQueries,
        })
      }

      // Return successful response with chat URL
      // Generate chat URL using path-based routing instead of subdomains
      const baseUrl = getBaseUrl()

      let chatUrl: string
      try {
        const url = new URL(baseUrl)
        let host = url.host
        if (host.startsWith('www.')) {
          host = host.substring(4)
        }
        chatUrl = `${url.protocol}//${host}/chat/${identifier}`
      } catch (error) {
        logger.warn('Failed to parse baseUrl, falling back to defaults:', {
          baseUrl,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        // Fallback based on environment
        if (isDev) {
          chatUrl = `http://localhost:3000/chat/${identifier}`
        } else {
          chatUrl = `https://sim.ai/chat/${identifier}`
        }
      }

      logger.info(`Chat "${title}" deployed successfully at ${chatUrl}`)

      try {
        const { PlatformEvents } = await import('@/lib/core/telemetry')
        PlatformEvents.chatDeployed({
          chatId: id,
          workflowId,
          authType,
          hasOutputConfigs: outputConfigs.length > 0,
        })
      } catch (_e) {
        // Silently fail
      }

      return createSuccessResponse({
        id: chatId,
        chatUrl,
        message: 'Chat deployment created successfully',
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

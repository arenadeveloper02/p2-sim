import { z } from 'zod'
import { defineRouteContract } from '@/lib/api/contracts/types'
import { workflowIdSchema, workspaceIdSchema } from '@/lib/api/contracts/primitives'

const workflowPatchOperationSchema = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('add_block'), block: z.record(z.string(), z.unknown()) }),
  z.object({
    operation: z.literal('update_block'),
    blockId: z.string().min(1),
    updates: z.record(z.string(), z.unknown()),
  }),
  z.object({ operation: z.literal('remove_block'), blockId: z.string().min(1) }),
  z.object({ operation: z.literal('add_edge'), edge: z.record(z.string(), z.unknown()) }),
  z.object({ operation: z.literal('remove_edge'), edgeId: z.string().min(1) }),
  z.object({
    operation: z.literal('update_variable'),
    variableId: z.string().min(1),
    updates: z.record(z.string(), z.unknown()),
  }),
  z.object({ operation: z.literal('add_variable'), variable: z.record(z.string(), z.unknown()) }),
  z.object({ operation: z.literal('remove_variable'), variableId: z.string().min(1) }),
])

export const workflowPatchSchema = z.object({
  type: z.literal('workflow_patch'),
  summary: z.string().min(1),
  changes: z.array(workflowPatchOperationSchema),
  requiresConfirmation: z.literal(true),
  warnings: z.array(z.string()).optional(),
  recommendations: z.array(z.string()).optional(),
})

export type WorkflowPatchWire = z.output<typeof workflowPatchSchema>

export const localCopilotConfigResponseSchema = z.object({
  enabled: z.boolean(),
  canSwitchBackend: z.boolean(),
  provider: z.string(),
  model: z.string(),
  selfHosted: z.boolean(),
})

export const getLocalCopilotConfigContract = defineRouteContract({
  method: 'GET',
  path: '/api/local-copilot/config',
  response: { mode: 'json', schema: localCopilotConfigResponseSchema },
})

export const localCopilotChatBodySchema = z.object({
  workspaceId: workspaceIdSchema,
  workflowId: workflowIdSchema,
  message: z.string().min(1, 'Message is required').max(32000),
  conversationId: z.string().uuid().optional(),
  selectedBlockId: z.string().optional(),
  executionId: z.string().optional(),
})

export type LocalCopilotChatBody = z.input<typeof localCopilotChatBodySchema>

export const localCopilotChatContract = defineRouteContract({
  method: 'POST',
  path: '/api/local-copilot/chat',
  body: localCopilotChatBodySchema,
  response: { mode: 'stream', contentType: 'text/event-stream' },
})

export const listLocalCopilotConversationsQuerySchema = z.object({
  workspaceId: workspaceIdSchema,
  workflowId: workflowIdSchema.optional(),
})

export const localCopilotConversationSchema = z.object({
  id: z.string().uuid(),
  title: z.string().nullable(),
  workflowId: z.string().nullable(),
  model: z.string(),
  provider: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const listLocalCopilotConversationsContract = defineRouteContract({
  method: 'GET',
  path: '/api/local-copilot/conversations',
  query: listLocalCopilotConversationsQuerySchema,
  response: {
    mode: 'json',
    schema: z.object({ conversations: z.array(localCopilotConversationSchema) }),
  },
})

export const localCopilotConversationParamsSchema = z.object({
  conversationId: z.string().uuid(),
})

export const localCopilotMessageSchema = z.object({
  id: z.string().uuid(),
  role: z.string(),
  content: z.object({
    text: z.string(),
    patchId: z.string().uuid().optional(),
    recommendations: z.array(z.string()).optional(),
  }),
  seq: z.number(),
  createdAt: z.string(),
})

export const getLocalCopilotConversationContract = defineRouteContract({
  method: 'GET',
  path: '/api/local-copilot/conversations/:conversationId',
  params: localCopilotConversationParamsSchema,
  response: {
    mode: 'json',
    schema: z.object({
      conversation: localCopilotConversationSchema,
      messages: z.array(localCopilotMessageSchema),
    }),
  },
})

export const localCopilotPatchParamsSchema = z.object({
  patchId: z.string().uuid(),
})

export const applyLocalCopilotPatchBodySchema = z.object({
  workflowId: workflowIdSchema,
})

export type ApplyLocalCopilotPatchBody = z.input<typeof applyLocalCopilotPatchBodySchema>

export const applyLocalCopilotPatchContract = defineRouteContract({
  method: 'POST',
  path: '/api/local-copilot/patches/:patchId/apply',
  params: localCopilotPatchParamsSchema,
  body: applyLocalCopilotPatchBodySchema,
  response: {
    mode: 'json',
    schema: z.object({
      success: z.boolean(),
      errors: z.array(z.string()).optional(),
    }),
  },
})

export const rejectLocalCopilotPatchContract = defineRouteContract({
  method: 'POST',
  path: '/api/local-copilot/patches/:patchId/reject',
  params: localCopilotPatchParamsSchema,
  response: {
    mode: 'json',
    schema: z.object({ success: z.boolean() }),
  },
})

export const getLocalCopilotPatchContract = defineRouteContract({
  method: 'GET',
  path: '/api/local-copilot/patches/:patchId',
  params: localCopilotPatchParamsSchema,
  response: {
    mode: 'json',
    schema: z.object({
      id: z.string().uuid(),
      summary: z.string(),
      status: z.enum(['pending', 'applied', 'rejected', 'expired']),
      patch: workflowPatchSchema,
    }),
  },
})

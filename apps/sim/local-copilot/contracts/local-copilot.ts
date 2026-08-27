import { z } from 'zod'
import {
  nonEmptyIdSchema,
  workflowIdSchema,
  workspaceIdSchema,
} from '@/lib/api/contracts/primitives'
import { defineRouteContract } from '@/lib/api/contracts/types'
import {
  LOCAL_COPILOT_CATALOG,
  type LocalCopilotCatalogId,
} from '@/local-copilot/lib/model-catalog'
import type { WorkflowPatch } from '@/local-copilot/lib/types'

const localCopilotCatalogIdSchema = z.enum(
  LOCAL_COPILOT_CATALOG.map((entry) => entry.id) as [
    LocalCopilotCatalogId,
    ...LocalCopilotCatalogId[],
  ]
)

/**
 * Runtime-permissive patch shape (LLM / DB payloads). Typed as {@link WorkflowPatch}
 * so clients and stream events share one domain type with apply/validate.
 */
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

const workflowPatchLooseSchema = z.object({
  type: z.literal('workflow_patch'),
  summary: z.string().min(1),
  changes: z.array(workflowPatchOperationSchema),
  requiresConfirmation: z.literal(true),
  warnings: z.array(z.string()).optional(),
  recommendations: z.array(z.string()).optional(),
})

export const workflowPatchSchema = workflowPatchLooseSchema as z.ZodType<WorkflowPatch>

export type WorkflowPatchWire = WorkflowPatch

export const localCopilotConfigResponseSchema = z.object({
  enabled: z.boolean(),
  canSwitchBackend: z.boolean(),
  localOnly: z.boolean(),
  defaultCatalogId: localCopilotCatalogIdSchema,
  provider: z.string(),
  model: z.string(),
  specialistModel: z.string(),
  selfHosted: z.boolean(),
})

export type LocalCopilotConfigResponse = z.output<typeof localCopilotConfigResponseSchema>

export const getLocalCopilotConfigContract = defineRouteContract({
  method: 'GET',
  path: '/api/local-copilot/config',
  response: { mode: 'json', schema: localCopilotConfigResponseSchema },
})

export const updateLocalCopilotConfigBodySchema = z.object({
  defaultCatalogId: localCopilotCatalogIdSchema,
})

export type UpdateLocalCopilotConfigBody = z.input<typeof updateLocalCopilotConfigBodySchema>

export const updateLocalCopilotConfigContract = defineRouteContract({
  method: 'PATCH',
  path: '/api/local-copilot/config',
  body: updateLocalCopilotConfigBodySchema,
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
  expectedRevision: z.string().min(1).optional(),
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
      revision: z.string().optional(),
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

const sessionMemoryEntitiesSchema = z.object({
  workflows: z.array(z.string()),
  blocks: z.array(z.string()),
  files: z.array(z.string()),
  runs: z.array(z.string()),
})

export const localCopilotSessionMemorySchema = z.object({
  version: z.literal(1),
  updatedAt: z.string().min(1),
  coveredThroughMessageId: z.string().min(1),
  goals: z.array(z.string()),
  decisions: z.array(z.string()),
  constraints: z.array(z.string()),
  activeDirective: z.string(),
  entities: sessionMemoryEntitiesSchema,
  progress: z.array(z.string()),
  openQuestions: z.array(z.string()),
  approvals: z.array(z.string()),
  failures: z.array(z.string()),
  verification: z.array(z.string()),
  notes: z.string(),
})

export type LocalCopilotSessionMemoryResponse = z.output<typeof localCopilotSessionMemorySchema>

export const getLocalCopilotSessionMemoryQuerySchema = z.object({
  chatId: nonEmptyIdSchema,
})

export type GetLocalCopilotSessionMemoryQuery = z.input<
  typeof getLocalCopilotSessionMemoryQuerySchema
>

export const getLocalCopilotSessionMemoryContract = defineRouteContract({
  method: 'GET',
  path: '/api/local-copilot/session-memory',
  query: getLocalCopilotSessionMemoryQuerySchema,
  response: {
    mode: 'json',
    schema: z.object({
      memory: localCopilotSessionMemorySchema.nullable(),
    }),
  },
})

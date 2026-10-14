import { z } from 'zod'
import { chatIdentifierParamsSchema } from '@/lib/api/contracts/chats'
import { defineRouteContract } from '@/lib/api/contracts/types'

const arenaUserIdSchema = z.string().trim().min(1, 'arenaUserId is required').max(256)
const publicUuidSchema = z.string().trim().min(1, 'publicUuid is required').max(256)
const threadChatIdSchema = z.string().trim().min(1, 'chatId is required').max(256)

export const arenaAgentThreadParamsSchema = chatIdentifierParamsSchema.extend({
  chatId: threadChatIdSchema,
})

export const arenaAgentThreadRecordSchema = z.object({
  id: z.string(),
  arenaUserId: z.string(),
  publicUuid: z.string(),
  chatSlug: z.string(),
  chatId: z.string(),
  title: z.string().nullable(),
  pinnedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const createArenaAgentThreadBodySchema = z.object({
  arenaUserId: arenaUserIdSchema,
  publicUuid: publicUuidSchema,
  chatId: threadChatIdSchema,
  title: z.string().trim().min(1, 'Title cannot be empty').max(200, 'Title is too long').optional(),
})
export type CreateArenaAgentThreadBody = z.input<typeof createArenaAgentThreadBodySchema>

export const listArenaAgentThreadsQuerySchema = z.object({
  arenaUserId: arenaUserIdSchema,
  publicUuid: publicUuidSchema,
})

export const listArenaAgentThreadsResponseSchema = z.object({
  records: z.array(arenaAgentThreadRecordSchema),
  total: z.number(),
})

export const updateArenaAgentThreadBodySchema = z
  .object({
    arenaUserId: arenaUserIdSchema,
    publicUuid: publicUuidSchema,
    title: z
      .string()
      .trim()
      .min(1, 'Title cannot be empty')
      .max(200, 'Title is too long')
      .optional(),
    pinned: z.boolean().optional(),
  })
  .refine((data) => data.title !== undefined || data.pinned !== undefined, {
    message: 'At least one of title or pinned is required',
  })
export type UpdateArenaAgentThreadBody = z.input<typeof updateArenaAgentThreadBodySchema>

export const arenaAgentScopeQuerySchema = z.object({
  arenaUserId: arenaUserIdSchema,
  publicUuid: publicUuidSchema,
})

export const arenaAgentMessageRecordSchema = z.object({
  id: z.string(),
  arenaUserId: z.string(),
  publicUuid: z.string(),
  chatSlug: z.string(),
  chatId: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  executionId: z.string().nullable(),
  createdAt: z.string(),
})

export const createArenaAgentMessageBodySchema = z.object({
  arenaUserId: arenaUserIdSchema,
  publicUuid: publicUuidSchema,
  role: z.enum(['user', 'assistant']),
  content: z.string().min(1, 'content is required').max(1_000_000, 'content is too long'),
  executionId: z.string().trim().min(1).max(256).optional(),
})
export type CreateArenaAgentMessageBody = z.input<typeof createArenaAgentMessageBodySchema>

export const listArenaAgentMessagesResponseSchema = z.object({
  messages: z.array(arenaAgentMessageRecordSchema),
})

export const upsertArenaAgentFeedbackBodySchema = z.object({
  arenaUserId: arenaUserIdSchema,
  publicUuid: publicUuidSchema,
  executionId: z.string().trim().min(1, 'executionId is required').max(256),
  liked: z.union([z.boolean(), z.null()]),
  comment: z.string().max(5000, 'comment is too long').optional(),
})
export type UpsertArenaAgentFeedbackBody = z.input<typeof upsertArenaAgentFeedbackBodySchema>

export const arenaAgentSuccessResponseSchema = z.object({
  success: z.literal(true),
})

export const createArenaAgentThreadContract = defineRouteContract({
  method: 'POST',
  path: '/api/chat/[identifier]/arena-threads',
  params: chatIdentifierParamsSchema,
  body: createArenaAgentThreadBodySchema,
  response: {
    mode: 'json',
    schema: arenaAgentThreadRecordSchema,
  },
})

export const listArenaAgentThreadsContract = defineRouteContract({
  method: 'GET',
  path: '/api/chat/[identifier]/arena-threads',
  params: chatIdentifierParamsSchema,
  query: listArenaAgentThreadsQuerySchema,
  response: {
    mode: 'json',
    schema: listArenaAgentThreadsResponseSchema,
  },
})

export const updateArenaAgentThreadContract = defineRouteContract({
  method: 'PATCH',
  path: '/api/chat/[identifier]/arena-threads/[chatId]',
  params: arenaAgentThreadParamsSchema,
  body: updateArenaAgentThreadBodySchema,
  response: {
    mode: 'json',
    schema: arenaAgentThreadRecordSchema,
  },
})

export const archiveArenaAgentThreadContract = defineRouteContract({
  method: 'DELETE',
  path: '/api/chat/[identifier]/arena-threads/[chatId]',
  params: arenaAgentThreadParamsSchema,
  query: arenaAgentScopeQuerySchema,
  response: {
    mode: 'json',
    schema: arenaAgentSuccessResponseSchema,
  },
})

export const listArenaAgentMessagesContract = defineRouteContract({
  method: 'GET',
  path: '/api/chat/[identifier]/arena-threads/[chatId]/messages',
  params: arenaAgentThreadParamsSchema,
  query: arenaAgentScopeQuerySchema,
  response: {
    mode: 'json',
    schema: listArenaAgentMessagesResponseSchema,
  },
})

export const createArenaAgentMessageContract = defineRouteContract({
  method: 'POST',
  path: '/api/chat/[identifier]/arena-threads/[chatId]/messages',
  params: arenaAgentThreadParamsSchema,
  body: createArenaAgentMessageBodySchema,
  response: {
    mode: 'json',
    schema: arenaAgentMessageRecordSchema,
  },
})

export const upsertArenaAgentFeedbackContract = defineRouteContract({
  method: 'POST',
  path: '/api/chat/arena-feedback',
  body: upsertArenaAgentFeedbackBodySchema,
  response: {
    mode: 'json',
    schema: arenaAgentSuccessResponseSchema,
  },
})

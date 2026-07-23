import { z } from 'zod'
import { chatIdentifierParamsSchema } from '@/lib/api/contracts/chats'
import { defineRouteContract } from '@/lib/api/contracts/types'

export const deployedChatThreadParamsSchema = chatIdentifierParamsSchema.extend({
  chatId: z.string().min(1, 'chatId is required'),
})

export const deployedChatThreadRecordSchema = z.object({
  chatId: z.string(),
  title: z.string().nullable(),
  workflowId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  pinnedAt: z.string().nullable().optional(),
})

export const listDeployedChatThreadsResponseSchema = z.object({
  records: z.array(deployedChatThreadRecordSchema),
  total: z.number(),
})

export const updateDeployedChatThreadBodySchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Title cannot be empty')
      .max(100, 'Title is too long')
      .optional(),
    pinned: z.boolean().optional(),
  })
  .refine((data) => data.title !== undefined || data.pinned !== undefined, {
    message: 'At least one field must be provided',
  })

export type UpdateDeployedChatThreadBody = z.input<typeof updateDeployedChatThreadBodySchema>
export type DeployedChatThreadRecord = z.output<typeof deployedChatThreadRecordSchema>
export type ListDeployedChatThreadsResponse = z.output<typeof listDeployedChatThreadsResponseSchema>

export const listDeployedChatThreadsContract = defineRouteContract({
  method: 'GET',
  path: '/api/chat/[identifier]/all-history',
  params: chatIdentifierParamsSchema,
  response: {
    mode: 'json',
    schema: listDeployedChatThreadsResponseSchema,
  },
})

export const updateDeployedChatThreadContract = defineRouteContract({
  method: 'PATCH',
  path: '/api/chat/[identifier]/threads/[chatId]',
  params: deployedChatThreadParamsSchema,
  body: updateDeployedChatThreadBodySchema,
  response: {
    mode: 'json',
    schema: z.object({
      success: z.literal(true),
    }),
  },
})

export const deleteDeployedChatThreadContract = defineRouteContract({
  method: 'DELETE',
  path: '/api/chat/[identifier]/threads/[chatId]',
  params: deployedChatThreadParamsSchema,
  response: {
    mode: 'json',
    schema: z.object({
      success: z.literal(true),
    }),
  },
})

import { z } from 'zod'
import { defineRouteContract } from '@/lib/api/contracts/types'

export const chatAuthTypeSchema = z.enum(['public', 'password', 'email', 'sso'])
export type ChatAuthType = z.output<typeof chatAuthTypeSchema>

export const chatIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const chatIdentifierParamsSchema = z.object({
  identifier: z.string().min(1),
})

export const chatOutputConfigSchema = z.object({
  blockId: z.string().min(1),
  path: z.string().min(1),
})

export const deployedChatOutputConfigSchema = z.object({
  blockId: z.string(),
  path: z.string().optional(),
})

export const chatCustomizationsSchema = z.object({
  primaryColor: z.string(),
  welcomeMessage: z.string(),
  imageUrl: z.string().optional(),
  goldenQueries: z.array(z.string()).optional(),
})

export const createChatBodySchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  identifier: z
    .string()
    .min(1, 'Identifier is required')
    .regex(/^[a-z0-9-]+$/, 'Identifier can only contain lowercase letters, numbers, and hyphens'),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  department: z.string().optional(),
  customizations: chatCustomizationsSchema,
  authType: chatAuthTypeSchema.default('public'),
  password: z.string().optional(),
  allowedEmails: z.array(z.string()).optional().default([]),
  outputConfigs: z.array(chatOutputConfigSchema).optional().default([]),
})
export type CreateChatBody = z.input<typeof createChatBodySchema>

export const updateChatBodySchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required').optional(),
  identifier: z
    .string()
    .min(1, 'Identifier is required')
    .regex(/^[a-z0-9-]+$/, 'Identifier can only contain lowercase letters, numbers, and hyphens')
    .optional(),
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().optional(),
  department: z.string().optional(),
  customizations: chatCustomizationsSchema.optional(),
  authType: chatAuthTypeSchema.optional(),
  password: z.string().optional(),
  allowedEmails: z.array(z.string()).optional(),
  outputConfigs: z.array(chatOutputConfigSchema).optional(),
})
export type UpdateChatBody = z.input<typeof updateChatBodySchema>

export const createChatResponseSchema = z.object({
  id: z.string(),
  chatId: z.string(),
  chatUrl: z.string(),
  message: z.string(),
})
export type CreateChatResponse = z.output<typeof createChatResponseSchema>

export const updateChatResponseSchema = z.object({
  id: z.string(),
  chatUrl: z.string(),
  message: z.string(),
})
export type UpdateChatResponse = z.output<typeof updateChatResponseSchema>

export const deleteChatResponseSchema = z.object({
  message: z.string(),
})

export const inputFormatFieldSchema = z.object({
  name: z.string().optional(),
  type: z.string().optional(),
  description: z.string().optional(),
  value: z.unknown().optional(),
})

const deployedGoldenQuerySchema = z.object({
  id: z.string().optional(),
  query: z.string().min(1),
})

export const deployedChatConfigSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.preprocess((value) => value ?? '', z.string()),
  customizations: z.preprocess(
    (value) => value ?? {},
    z
      .object({
        primaryColor: z.string().optional(),
        logoUrl: z.string().optional(),
        imageUrl: z.string().optional(),
        welcomeMessage: z.string().optional(),
        headerText: z.string().optional(),
        goldenQueries: z
          .union([z.array(z.string()), z.array(deployedGoldenQuerySchema)])
          .optional(),
      })
      .passthrough()
  ),
  authType: z.preprocess((value) => value ?? 'public', chatAuthTypeSchema),
  outputConfigs: z.preprocess(
    (value) => value ?? undefined,
    z.array(deployedChatOutputConfigSchema).optional()
  ),
  inputFormat: z.array(inputFormatFieldSchema).optional(),
  department: z.string().nullable().optional(),
  userWorkspaceIds: z.array(z.string()).optional(),
})
export type DeployedChatConfig = z.output<typeof deployedChatConfigSchema>

export const deployedChatAuthBodySchema = z.object({
  password: z.string().max(1024, 'Password is too long').optional(),
  email: z.string().email('Invalid email format').optional().or(z.literal('')),
})
export type DeployedChatAuthBody = z.input<typeof deployedChatAuthBodySchema>

export const goldenQueriesSchema = z.object({
  goldenQueries: z.array(
    z.object({
      id: z.string().optional(),
      query: z.string().min(1),
    })
  ),
  deleteMode: z.enum(['hard', 'soft']).optional(),
})

const MAX_CHAT_INPUT_CHARS = 1_000_000
const MAX_CHAT_FILE_DATA_CHARS = 14 * 1024 * 1024
const MAX_CHAT_FILES = 15

export const deployedChatFileSchema = z.object({
  name: z.string().min(1, 'File name is required').max(255, 'File name is too long'),
  type: z.string().min(1, 'File type is required').max(255, 'File type is too long'),
  size: z.number().positive('File size must be positive'),
  data: z
    .string()
    .min(1, 'File data is required')
    .max(MAX_CHAT_FILE_DATA_CHARS, 'File data exceeds the maximum allowed size'),
  url: z.string().optional(),
  lastModified: z.number().optional(),
})

export const deployedChatPostBodySchema = z.object({
  input: z.string().max(MAX_CHAT_INPUT_CHARS, 'Input is too long').optional(),
  password: z.string().max(1024, 'Password is too long').optional(),
  email: z.string().email('Invalid email format').optional().or(z.literal('')),
  conversationId: z.string().max(256, 'Conversation ID is too long').optional(),
  chatId: z.string().optional(), // chatId for tracking conversation context
  files: z
    .array(deployedChatFileSchema)
    .max(MAX_CHAT_FILES, `A maximum of ${MAX_CHAT_FILES} files is allowed`)
    .optional()
    .default([]),
  startBlockInputs: z.record(z.string(), z.unknown()).optional(),
})
export type DeployedChatPostBody = z.input<typeof deployedChatPostBodySchema>

export const chatSSOBodySchema = z.object({
  email: z.string().email('Invalid email address'),
})

export const chatSSOResponseSchema = z.object({
  eligible: z.boolean(),
})
export type ChatSSOResponse = z.output<typeof chatSSOResponseSchema>

export const chatEmailOtpRequestBodySchema = z.object({
  email: z.string().email('Invalid email address'),
})

export const chatEmailOtpVerifyBodySchema = chatEmailOtpRequestBodySchema.extend({
  otp: z.string().length(6, 'OTP must be 6 digits'),
})

export const chatEmailOtpRequestResponseSchema = z.object({
  message: z.string(),
})

export const identifierValidationQuerySchema = z.object({
  identifier: z
    .string()
    .min(1, 'Identifier is required')
    .regex(/^[a-z0-9-]+$/, 'Identifier can only contain lowercase letters, numbers, and hyphens')
    .max(100, 'Identifier must be 100 characters or less'),
})

export const identifierValidationResponseSchema = z.object({
  available: z.boolean(),
  error: z.string().nullable().optional(),
})

export const createChatContract = defineRouteContract({
  method: 'POST',
  path: '/api/chat',
  body: createChatBodySchema,
  response: {
    mode: 'json',
    schema: createChatResponseSchema,
  },
})

export const getDeployedChatConfigContract = defineRouteContract({
  method: 'GET',
  path: '/api/chat/[identifier]',
  params: chatIdentifierParamsSchema,
  response: {
    mode: 'json',
    schema: deployedChatConfigSchema,
  },
})

export const authenticateDeployedChatContract = defineRouteContract({
  method: 'POST',
  path: '/api/chat/[identifier]',
  params: chatIdentifierParamsSchema,
  body: deployedChatAuthBodySchema,
  response: {
    mode: 'json',
    schema: deployedChatConfigSchema,
  },
})

export const deployedChatPostContract = defineRouteContract({
  method: 'POST',
  path: '/api/chat/[identifier]',
  params: chatIdentifierParamsSchema,
  body: deployedChatPostBodySchema,
  response: {
    mode: 'json',
    schema: deployedChatConfigSchema,
  },
})

export const chatSSOContract = defineRouteContract({
  method: 'POST',
  path: '/api/chat/[identifier]/sso',
  params: chatIdentifierParamsSchema,
  body: chatSSOBodySchema,
  response: {
    mode: 'json',
    schema: chatSSOResponseSchema,
  },
})

export const requestChatEmailOtpContract = defineRouteContract({
  method: 'POST',
  path: '/api/chat/[identifier]/otp',
  params: chatIdentifierParamsSchema,
  body: chatEmailOtpRequestBodySchema,
  response: {
    mode: 'json',
    schema: chatEmailOtpRequestResponseSchema,
  },
})

export const verifyChatEmailOtpContract = defineRouteContract({
  method: 'PUT',
  path: '/api/chat/[identifier]/otp',
  params: chatIdentifierParamsSchema,
  body: chatEmailOtpVerifyBodySchema,
  response: {
    mode: 'json',
    schema: deployedChatConfigSchema,
  },
})

export const validateChatIdentifierContract = defineRouteContract({
  method: 'GET',
  path: '/api/chat/validate',
  query: identifierValidationQuerySchema,
  response: {
    mode: 'json',
    schema: identifierValidationResponseSchema,
  },
})

export const updateChatContract = defineRouteContract({
  method: 'PATCH',
  path: '/api/chat/manage/[id]',
  params: chatIdParamsSchema,
  body: updateChatBodySchema,
  response: {
    mode: 'json',
    schema: updateChatResponseSchema,
  },
})

export const deleteChatContract = defineRouteContract({
  method: 'DELETE',
  path: '/api/chat/manage/[id]',
  params: chatIdParamsSchema,
  response: {
    mode: 'json',
    schema: deleteChatResponseSchema,
  },
})

export const deployedChatDeploymentVersionSchema = z.object({
  deploymentVersionId: z.string().nullable(),
  version: z.number().nullable(),
  versionName: z.string().nullable(),
  versionCreatedAt: z.string().nullable(),
})
export type DeployedChatDeploymentVersion = z.output<typeof deployedChatDeploymentVersionSchema>

export const deployedChatHistoryLogSchema = z.object({
  id: z.string(),
  executionId: z.string(),
  level: z.string(),
  trigger: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  totalDurationMs: z.number().nullable(),
  conversationId: z.string().nullable(),
  userInput: z.string().nullable(),
  attachments: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      name: z.string(),
      type: z.string(),
      size: z.number(),
      dataUrl: z.string(),
    })
  ),
  modelOutput: z.string().nullable(),
  generatedImages: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      url: z.string(),
      type: z.string(),
    })
  ),
  knowledgeRefs: z
    .array(
      z.object({
        documentId: z.string(),
        documentName: z.string(),
        chunkId: z.string(),
        chunkIndex: z.number().optional(),
        knowledgeBaseId: z.string(),
        workspaceId: z.string().nullable(),
      })
    )
    .nullable(),
  liked: z.boolean().nullable(),
  createdAt: z.string(),
  deploymentVersion: deployedChatDeploymentVersionSchema,
})
export type DeployedChatHistoryLog = z.output<typeof deployedChatHistoryLogSchema>

export const deployedChatHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  conversationId: z.string().optional(),
  chatId: z.string().optional(),
  level: z.enum(['info', 'error']).optional(),
})
export type DeployedChatHistoryQuery = z.input<typeof deployedChatHistoryQuerySchema>

export const deployedChatHistoryResponseSchema = z.object({
  logs: z.array(deployedChatHistoryLogSchema),
  pagination: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.union([z.number(), z.string()]),
    hasMore: z.boolean(),
  }),
})
export type DeployedChatHistoryResponse = z.output<typeof deployedChatHistoryResponseSchema>

export const getDeployedChatHistoryContract = defineRouteContract({
  method: 'GET',
  path: '/api/chat/[identifier]/history',
  params: chatIdentifierParamsSchema,
  query: deployedChatHistoryQuerySchema,
  response: {
    mode: 'json',
    schema: deployedChatHistoryResponseSchema,
  },
})

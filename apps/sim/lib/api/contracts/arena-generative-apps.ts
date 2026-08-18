import { z } from 'zod'
import { chatAuthTypeSchema, chatDeploymentPasswordSchema } from '@/lib/api/contracts/chats'
import { unknownRecordSchema, workflowIdSchema } from '@/lib/api/contracts/primitives'
import {
  toolFailureResponseSchema,
  toolSuccessResponseSchema,
} from '@/lib/api/contracts/tool-primitives'
import { defineRouteContract } from '@/lib/api/contracts/types'
import { isReservedGenerativeAppIdentifier } from '@/lib/arena-generative-ui/types'

export const arenaGenerativePagePathSchema = z
  .string()
  .min(1, 'Page path is required')
  .max(64, 'Page path is too long')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Page path must be kebab-case')

export const arenaGenerativePageHintSchema = z.object({
  path: arenaGenerativePagePathSchema,
  title: z.string().min(1).max(120).optional(),
  purpose: z.string().max(500).optional(),
})

export const arenaGenerativeHttpBindingSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  url: z.string().url('HTTP binding URL must be valid').max(2048),
  headersSecretName: z.string().max(128).optional(),
  authHeaderName: z.string().min(1).max(128).optional(),
})

export const arenaGenerativeApiBindingSchema = z
  .object({
    key: z.string().min(1, 'API key is required').max(64),
    label: z.string().min(1).max(120).optional(),
    kind: z.enum(['workflow', 'http']),
    workflowId: z.string().min(1).optional(),
    http: arenaGenerativeHttpBindingSchema.optional(),
    inputSchema: z
      .array(
        z.object({
          name: z.string().min(1),
          type: z.string().min(1).optional(),
        })
      )
      .max(40)
      .optional(),
    outputSchema: z
      .array(
        z.object({
          name: z.string().min(1, 'outputSchema field name cannot be empty'),
          type: z.string().min(1).optional(),
        })
      )
      .max(40, 'outputSchema is limited to 40 fields')
      .optional(),
    stream: z.boolean().optional(),
  })
  .superRefine((binding, ctx) => {
    if (binding.kind === 'workflow' && !binding.workflowId) {
      ctx.addIssue({
        code: 'custom',
        path: ['workflowId'],
        message: 'workflowId is required for workflow bindings',
      })
    }
    if (binding.kind === 'http' && !binding.http) {
      ctx.addIssue({
        code: 'custom',
        path: ['http'],
        message: 'http is required for HTTP bindings',
      })
    }
  })

export const arenaGenerativeManifestSchema = z.object({
  entryPath: arenaGenerativePagePathSchema,
  pages: z.record(
    z.string(),
    z.object({
      title: z.string(),
      path: z.string(),
      spec: unknownRecordSchema,
    })
  ),
  actions: z.record(
    z.string(),
    z.object({
      apiKey: z.string(),
      inputMapping: z.record(z.string(), z.string()).optional(),
      onSuccess: z
        .object({
          navigate: z.string().optional(),
          setState: unknownRecordSchema.optional(),
        })
        .optional(),
      onError: z
        .object({
          setState: unknownRecordSchema.optional(),
        })
        .optional(),
    })
  ),
})

export const arenaGenerativePageSummarySchema = z.object({
  path: z.string(),
  title: z.string(),
})

function omitEmptyOptionalJson(value: unknown): unknown {
  if (value == null) return undefined
  if (typeof value === 'string' && value.trim() === '') return undefined
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
    return undefined
  }
  return value
}

function omitEmptyOptionalString(value: unknown): unknown {
  if (value == null) return undefined
  if (typeof value === 'string' && value.trim() === '') return undefined
  return value
}

function coerceUserInput(value: unknown): unknown {
  if (typeof value === 'string') return value
  if (value == null) return value
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export const arenaGenerativeGenerateBodySchema = z.object({
  userInput: z.preprocess(coerceUserInput, z.string().min(1, 'userInput is required').max(20_000)),
  pages: z.preprocess(
    omitEmptyOptionalJson,
    z.union([z.array(arenaGenerativePageHintSchema), z.string()]).optional()
  ),
  entryPath: z.preprocess(omitEmptyOptionalString, arenaGenerativePagePathSchema.optional()),
  apiBindings: z.preprocess(
    omitEmptyOptionalJson,
    z.union([z.array(arenaGenerativeApiBindingSchema), z.string()]).optional()
  ),
  designNotes: z.preprocess(omitEmptyOptionalString, z.string().max(4000).optional()),
  existingDraftId: z.string().min(1).optional(),
  workspaceId: z.string().min(1).optional(),
  workflowId: z.string().min(1).optional(),
  executionId: z.string().optional(),
})
export type ArenaGenerativeGenerateBody = z.input<typeof arenaGenerativeGenerateBodySchema>

export const arenaGenerativeGenerateOutputSchema = z.object({
  draftId: z.string(),
  revisionId: z.string(),
  entryPath: z.string(),
  pages: z.array(arenaGenerativePageSummarySchema),
  content: z.string(),
  manifest: arenaGenerativeManifestSchema,
})

export const arenaGenerativeGenerateContract = defineRouteContract({
  method: 'POST',
  path: '/api/tools/arena_generative_ui/generate',
  body: arenaGenerativeGenerateBodySchema,
  response: {
    mode: 'json',
    schema: z.union([
      toolSuccessResponseSchema(arenaGenerativeGenerateOutputSchema),
      toolFailureResponseSchema.extend({
        output: arenaGenerativeGenerateOutputSchema.partial().optional(),
      }),
    ]),
  },
})

export const arenaGenerativeEditContract = defineRouteContract({
  method: 'POST',
  path: '/api/tools/arena_generative_ui/edit',
  body: arenaGenerativeGenerateBodySchema.extend({
    existingDraftId: z.string().min(1, 'existingDraftId is required'),
  }),
  response: {
    mode: 'json',
    schema: z.union([
      toolSuccessResponseSchema(arenaGenerativeGenerateOutputSchema),
      toolFailureResponseSchema.extend({
        output: arenaGenerativeGenerateOutputSchema.partial().optional(),
      }),
    ]),
  },
})

export const listGenerativeAppDraftsQuerySchema = z.object({
  workflowId: workflowIdSchema.optional(),
})

export const generativeAppDraftSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  entryPath: z.string(),
  revision: z.number(),
  workflowId: z.string(),
  updatedAt: z.string(),
})

export const listGenerativeAppDraftsContract = defineRouteContract({
  method: 'GET',
  path: '/api/gui-apps/drafts',
  query: listGenerativeAppDraftsQuerySchema,
  response: {
    mode: 'json',
    schema: z.object({
      drafts: z.array(generativeAppDraftSummarySchema),
    }),
  },
})

export const generativeAppDraftIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const getGenerativeAppDraftContract = defineRouteContract({
  method: 'GET',
  path: '/api/gui-apps/drafts/[id]',
  params: generativeAppDraftIdParamsSchema,
  response: {
    mode: 'json',
    schema: z.object({
      id: z.string(),
      title: z.string(),
      entryPath: z.string(),
      revision: z.number(),
      workflowId: z.string(),
      latestRevisionId: z.string().nullable(),
      pages: z.array(arenaGenerativePageSummarySchema),
      apiBindings: z.array(arenaGenerativeApiBindingSchema),
      manifest: arenaGenerativeManifestSchema,
    }),
  },
})

export const generativeAppIdentifierQuerySchema = z.object({
  identifier: z
    .string()
    .min(1, 'Identifier is required')
    .regex(/^[a-z0-9-]+$/, 'Identifier can only contain lowercase letters, numbers, and hyphens')
    .max(100, 'Identifier must be 100 characters or less'),
})

export const validateGenerativeAppIdentifierContract = defineRouteContract({
  method: 'GET',
  path: '/api/gui-apps/validate',
  query: generativeAppIdentifierQuerySchema,
  response: {
    mode: 'json',
    schema: z.object({
      available: z.boolean(),
      error: z.string().nullable().optional(),
    }),
  },
})

export const createDeployedAppBodySchema = z.object({
  workflowId: workflowIdSchema,
  draftId: z.string().min(1, 'Draft ID is required'),
  revisionId: z.string().min(1).optional(),
  identifier: z
    .string()
    .min(1, 'Identifier is required')
    .regex(/^[a-z0-9-]+$/, 'Identifier can only contain lowercase letters, numbers, and hyphens')
    .refine((value) => !isReservedGenerativeAppIdentifier(value), {
      message: 'This identifier is reserved',
    }),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional(),
  department: z.string().max(200).optional(),
  authType: chatAuthTypeSchema.default('public'),
  password: chatDeploymentPasswordSchema.optional(),
  allowedEmails: z.array(z.string()).optional().default([]),
  requireArenaEmailId: z.boolean().optional().default(false),
})
export type CreateDeployedAppBody = z.input<typeof createDeployedAppBodySchema>

export const createDeployedAppResponseSchema = z.object({
  id: z.string(),
  appUrl: z.string(),
  message: z.string(),
})

export const createDeployedAppContract = defineRouteContract({
  method: 'POST',
  path: '/api/gui-apps',
  body: createDeployedAppBodySchema,
  response: {
    mode: 'json',
    schema: createDeployedAppResponseSchema,
  },
})

export const updateDeployedAppBodySchema = createDeployedAppBodySchema.partial().extend({
  workflowId: workflowIdSchema.optional(),
  isActive: z.boolean().optional(),
})
export type UpdateDeployedAppBody = z.input<typeof updateDeployedAppBodySchema>

export const deployedAppIdParamsSchema = z.object({
  id: z.string().min(1),
})

export const updateDeployedAppContract = defineRouteContract({
  method: 'PATCH',
  path: '/api/gui-apps/manage/[id]',
  params: deployedAppIdParamsSchema,
  body: updateDeployedAppBodySchema,
  response: {
    mode: 'json',
    schema: createDeployedAppResponseSchema,
  },
})

export const deleteDeployedAppContract = defineRouteContract({
  method: 'DELETE',
  path: '/api/gui-apps/manage/[id]',
  params: deployedAppIdParamsSchema,
  response: {
    mode: 'json',
    schema: z.object({ message: z.string() }),
  },
})

export const deployedAppIdentifierParamsSchema = z.object({
  identifier: z.string().min(1),
})

export const deployedAppConfigSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.preprocess((value) => value ?? '', z.string()),
  authType: z.preprocess((value) => value ?? 'public', chatAuthTypeSchema),
  requireArenaEmailId: z.boolean(),
  entryPath: z.string(),
  pages: z.array(arenaGenerativePageSummarySchema),
  streamingActionIds: z.array(z.string()).optional().default([]),
  streamingNavigate: z.record(z.string(), z.string()).optional().default({}),
})
export type DeployedAppConfig = z.output<typeof deployedAppConfigSchema>

export const getDeployedAppConfigContract = defineRouteContract({
  method: 'GET',
  path: '/api/gui-apps/[identifier]',
  params: deployedAppIdentifierParamsSchema,
  response: {
    mode: 'json',
    schema: deployedAppConfigSchema,
  },
})

export const authenticateDeployedAppContract = defineRouteContract({
  method: 'POST',
  path: '/api/gui-apps/[identifier]',
  params: deployedAppIdentifierParamsSchema,
  body: z.object({
    password: z.string().max(1024).optional(),
    email: z.string().email().optional().or(z.literal('')),
  }),
  response: {
    mode: 'json',
    schema: deployedAppConfigSchema,
  },
})

export const deployedAppPageParamsSchema = z.object({
  identifier: z.string().min(1),
  path: z.string().min(1),
})

export const getDeployedAppPageContract = defineRouteContract({
  method: 'GET',
  path: '/api/gui-apps/[identifier]/pages/[path]',
  params: deployedAppPageParamsSchema,
  response: {
    mode: 'json',
    schema: z.object({
      path: z.string(),
      title: z.string(),
      spec: unknownRecordSchema,
    }),
  },
})

export const deployedAppActionParamsSchema = z.object({
  identifier: z.string().min(1),
  actionId: z.string().min(1),
})

export const runDeployedAppActionBodySchema = z.object({
  values: unknownRecordSchema.optional().default({}),
  emailId: z.string().max(320).optional(),
})

export const runDeployedAppActionResponseSchema = z.object({
  ok: z.boolean(),
  data: z.unknown().optional(),
  navigate: z.string().optional(),
  setState: unknownRecordSchema.optional(),
  error: z.string().optional(),
})

export const runDeployedAppActionContract = defineRouteContract({
  method: 'POST',
  path: '/api/gui-apps/[identifier]/actions/[actionId]',
  params: deployedAppActionParamsSchema,
  body: runDeployedAppActionBodySchema,
  response: {
    mode: 'json',
    schema: runDeployedAppActionResponseSchema,
  },
})

export const runDeployedAppActionStreamContract = defineRouteContract({
  method: 'POST',
  path: '/api/gui-apps/[identifier]/actions/[actionId]',
  params: deployedAppActionParamsSchema,
  body: runDeployedAppActionBodySchema,
  response: {
    mode: 'stream',
  },
})

export const generativeAppDraftActionParamsSchema = z.object({
  id: z.string().min(1),
  actionId: z.string().min(1),
})

export const runGenerativeAppDraftActionBodySchema = z.object({
  values: unknownRecordSchema.optional().default({}),
})

export const runGenerativeAppDraftActionContract = defineRouteContract({
  method: 'POST',
  path: '/api/gui-apps/drafts/[id]/actions/[actionId]',
  params: generativeAppDraftActionParamsSchema,
  body: runGenerativeAppDraftActionBodySchema,
  response: {
    mode: 'json',
    schema: runDeployedAppActionResponseSchema,
  },
})

export const runGenerativeAppDraftActionStreamContract = defineRouteContract({
  method: 'POST',
  path: '/api/gui-apps/drafts/[id]/actions/[actionId]',
  params: generativeAppDraftActionParamsSchema,
  body: runGenerativeAppDraftActionBodySchema,
  response: {
    mode: 'stream',
  },
})

export const generativeAppStatusQuerySchema = z.object({
  workflowId: workflowIdSchema,
})

export const requestGenerativeAppEmailOtpContract = defineRouteContract({
  method: 'POST',
  path: '/api/gui-apps/[identifier]/otp',
  params: deployedAppIdentifierParamsSchema,
  body: z.object({
    email: z.string().email('Invalid email address'),
  }),
  response: {
    mode: 'json',
    schema: z.object({ message: z.string() }),
  },
})

export const verifyGenerativeAppEmailOtpContract = defineRouteContract({
  method: 'PUT',
  path: '/api/gui-apps/[identifier]/otp',
  params: deployedAppIdentifierParamsSchema,
  body: z.object({
    email: z.string().email('Invalid email address'),
    otp: z.string().length(6, 'OTP must be 6 digits'),
  }),
  response: {
    mode: 'json',
    schema: deployedAppConfigSchema,
  },
})

export const generativeAppSsoContract = defineRouteContract({
  method: 'POST',
  path: '/api/gui-apps/[identifier]/sso',
  params: deployedAppIdentifierParamsSchema,
  body: z.object({
    email: z.string().email('Invalid email address'),
  }),
  response: {
    mode: 'json',
    schema: z.object({ eligible: z.boolean() }),
  },
})

export const getGenerativeAppStatusContract = defineRouteContract({
  method: 'GET',
  path: '/api/gui-apps/status',
  query: generativeAppStatusQuerySchema,
  response: {
    mode: 'json',
    schema: z.object({
      isDeployed: z.boolean(),
      deployment: z
        .object({
          id: z.string(),
          identifier: z.string(),
          title: z.string(),
          authType: z.string(),
          requireArenaEmailId: z.boolean(),
        })
        .nullable(),
    }),
  },
})

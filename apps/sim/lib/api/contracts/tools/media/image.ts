import { z } from 'zod'
import { toolBooleanSchema, toolJsonResponseSchema } from '@/lib/api/contracts/tools/media/shared'
import { defineRouteContract } from '@/lib/api/contracts/types'

export const imageProviders = ['openai', 'gemini', 'falai', 'ideogram'] as const
const MISSING_IMAGE_FIELDS_ERROR = 'Missing required fields: provider, apiKey, and prompt'

export const imageProxyQuerySchema = z.object({
  url: z.string({ error: 'Missing URL parameter' }).min(1, 'Missing URL parameter'),
})

function hasJsonPrompt(body: Record<string, unknown>): boolean {
  const value = body.jsonPrompt
  if (value === undefined || value === null) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

export const imageToolBodySchema = z
  .object({
    provider: z
      .string({ error: MISSING_IMAGE_FIELDS_ERROR })
      .min(1, MISSING_IMAGE_FIELDS_ERROR)
      .refine((provider) => imageProviders.includes(provider as (typeof imageProviders)[number]), {
        message: `Invalid provider. Must be one of: ${imageProviders.join(', ')}`,
      }),
    apiKey: z.string().optional(),
    model: z.string().optional(),
    prompt: z.string().optional(),
    jsonPrompt: z.unknown().optional(),
    renderingSpeed: z.enum(['TURBO', 'DEFAULT', 'QUALITY']).optional(),
    enableCopyrightDetection: toolBooleanSchema.optional(),
    size: z.string().optional(),
    aspectRatio: z.string().optional(),
    resolution: z.string().optional(),
    quality: z.string().optional(),
    background: z.string().optional(),
    outputFormat: z.string().optional(),
    moderation: z.string().optional(),
    safetyTolerance: z.string().optional(),
    numImages: z.coerce.number().int().optional(),
    seed: z.coerce.number().int().optional(),
    enableSafetyChecker: toolBooleanSchema.optional(),
    enableWebSearch: toolBooleanSchema.optional(),
    thinkingLevel: z.string().optional(),
    workspaceId: z.string().optional(),
    workflowId: z.string().optional(),
    executionId: z.string().optional(),
    userId: z.string().optional(),
    useHostedCostTracking: z.boolean().optional(),
  })
  .passthrough()
  .superRefine((body, ctx) => {
    if (body.provider === 'falai' && !body.apiKey?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['apiKey'],
        message: MISSING_IMAGE_FIELDS_ERROR,
      })
    }

    if (body.provider === 'ideogram') {
      const prompt = body.prompt?.trim() ?? ''
      const jsonPromptProvided = hasJsonPrompt(body as Record<string, unknown>)
      if (!prompt && !jsonPromptProvided) {
        ctx.addIssue({
          code: 'custom',
          path: ['prompt'],
          message: 'Either prompt or jsonPrompt is required for Ideogram generation',
        })
      }
      if (prompt && jsonPromptProvided) {
        ctx.addIssue({
          code: 'custom',
          path: ['jsonPrompt'],
          message: 'Provide either prompt (text_prompt) or jsonPrompt, not both',
        })
      }
      return
    }

    if (!body.prompt?.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['prompt'],
        message: MISSING_IMAGE_FIELDS_ERROR,
      })
    }
  })

export type ImageToolBody = z.infer<typeof imageToolBodySchema>

export const imageProxyContract = defineRouteContract({
  method: 'GET',
  path: '/api/tools/image',
  query: imageProxyQuerySchema,
  response: { mode: 'binary' },
})

export const imageToolContract = defineRouteContract({
  method: 'POST',
  path: '/api/tools/image',
  body: imageToolBodySchema,
  response: { mode: 'json', schema: toolJsonResponseSchema },
})

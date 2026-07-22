import { z } from 'zod'
import { toolBooleanSchema } from '@/lib/api/contracts/tools/media/shared'
import { defineRouteContract } from '@/lib/api/contracts/types'

/**
 * Optional fields tolerate null because block subBlocks (switches, dropdowns)
 * emit null for untouched inputs; nulls are normalized to undefined on parse.
 */
export const figmaToHtmlBodySchema = z.object({
  fileKey: z.string({ error: 'fileKey is required' }).min(1, 'fileKey cannot be empty').max(200),
  nodeId: z
    .string()
    .max(200)
    .nullish()
    .transform((value) => value ?? undefined),
  includeStyles: toolBooleanSchema.nullish().transform((value) => value ?? undefined),
  responsive: toolBooleanSchema.nullish().transform((value) => value ?? undefined),
  outputFormat: z
    .string()
    .max(50)
    .nullish()
    .transform((value) => value ?? undefined),
  customPrompt: z
    .string()
    .max(20_000)
    .nullish()
    .transform((value) => value ?? undefined),
  workspaceId: z.string().optional(),
})

export const figmaToHtmlResponseSchema = z.object({
  metadata: z.object({
    fileKey: z.string(),
    nodeId: z.string().optional(),
    processingTime: z.number(),
    aiModel: z.string(),
    tokensUsed: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    combinedHtml: z.string(),
  }),
})

export const figmaToHtmlContract = defineRouteContract({
  method: 'POST',
  path: '/api/tools/figma/to-html',
  body: figmaToHtmlBodySchema,
  response: { mode: 'json', schema: figmaToHtmlResponseSchema },
})

export type FigmaToHtmlBody = z.input<typeof figmaToHtmlBodySchema>
export type FigmaToHtmlResponse = z.output<typeof figmaToHtmlResponseSchema>

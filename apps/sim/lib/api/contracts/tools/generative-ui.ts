import { z } from 'zod'
import {
  toolFailureResponseSchema,
  toolSuccessResponseSchema,
} from '@/lib/api/contracts/tool-primitives'
import { defineRouteContract } from '@/lib/api/contracts/types'

export const generativeUiModeSchema = z.enum(['email', 'webpage'])

export const generativeUiGenerateBodySchema = z.object({
  userInput: z.string().min(1, 'userInput is required'),
  mode: generativeUiModeSchema,
})

export type GenerativeUiGenerateBody = z.input<typeof generativeUiGenerateBodySchema>

export const generativeUiGenerateOutputSchema = z.object({
  html: z.string(),
  spec: z.record(z.string(), z.unknown()),
  mode: generativeUiModeSchema,
})

export const generativeUiGenerateContract = defineRouteContract({
  method: 'POST',
  path: '/api/tools/generative_ui/generate',
  body: generativeUiGenerateBodySchema,
  response: {
    mode: 'json',
    schema: z.union([
      toolSuccessResponseSchema(generativeUiGenerateOutputSchema),
      toolFailureResponseSchema.extend({
        output: generativeUiGenerateOutputSchema.optional(),
      }),
    ]),
  },
})

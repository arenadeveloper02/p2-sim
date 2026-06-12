import { z } from 'zod'
import {
  toolFailureResponseSchema,
  toolSuccessResponseSchema,
} from '@/lib/api/contracts/tool-primitives'
import { defineRouteContract } from '@/lib/api/contracts/types'

export const ideogramPromptBuildBodySchema = z.object({
  builderValue: z.unknown(),
})

export const ideogramPromptBuildContract = defineRouteContract({
  method: 'POST',
  path: '/api/tools/ideogram-prompt',
  body: ideogramPromptBuildBodySchema,
  response: {
    mode: 'json',
    schema: z.union([
      toolSuccessResponseSchema(
        z.object({
          jsonPrompt: z.record(z.string(), z.unknown()),
          promptPreview: z.string(),
          elements: z.array(z.record(z.string(), z.unknown())),
          metadata: z.object({
            elementCount: z.number(),
            resolution: z.string(),
            renderingSpeed: z.string().optional(),
            hasStyleDescription: z.boolean(),
            bboxElementCount: z.number(),
          }),
        })
      ),
      toolFailureResponseSchema,
    ]),
  },
})

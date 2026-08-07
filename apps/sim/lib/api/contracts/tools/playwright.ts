import { z } from 'zod'
import { unknownRecordSchema } from '@/lib/api/contracts/primitives'
import { defineRouteContract } from '@/lib/api/contracts/types'

export const playwrightRunTaskBodySchema = z.object({
  task: z.string().min(1, 'task is required'),
  startUrl: z.string().optional(),
  model: z.string().min(1, 'model is required'),
  apiKey: z.string().min(1, 'apiKey is required'),
  variables: z.unknown().optional(),
  allowedDomains: z.union([z.string(), z.array(z.string())]).optional(),
  maxSteps: z.number().int().min(1).max(500).optional(),
  structuredOutput: z.string().optional(),
})

export type PlaywrightRunTaskBody = z.input<typeof playwrightRunTaskBodySchema>

export const playwrightRunTaskContract = defineRouteContract({
  method: 'POST',
  path: '/api/tools/playwright/run-task',
  body: playwrightRunTaskBodySchema,
  response: {
    mode: 'json',
    schema: unknownRecordSchema,
  },
})

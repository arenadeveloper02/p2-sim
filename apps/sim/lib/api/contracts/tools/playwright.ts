import { z } from 'zod'
import {
  toolFailureResponseSchema,
  toolSuccessResponseSchema,
} from '@/lib/api/contracts/tool-primitives'
import { defineRouteContract } from '@/lib/api/contracts/types'

export const playwrightStepSchema = z
  .object({
    type: z.enum(['navigate', 'snapshot', 'click', 'type', 'screenshot', 'wait', 'press']),
    url: z.string().optional(),
    ref: z.string().optional(),
    selector: z.string().optional(),
    text: z.string().optional(),
    submit: z.boolean().optional(),
    key: z.string().optional(),
    timeMs: z.number().int().positive().max(120_000).optional(),
    fullPage: z.boolean().optional(),
  })
  .superRefine((step, ctx) => {
    switch (step.type) {
      case 'navigate':
        if (!step.url?.trim()) {
          ctx.addIssue({ code: 'custom', message: 'navigate step requires url', path: ['url'] })
        }
        break
      case 'click':
        if (!step.ref?.trim() && !step.selector?.trim()) {
          ctx.addIssue({
            code: 'custom',
            message: 'click step requires ref or selector',
            path: ['ref'],
          })
        }
        break
      case 'type':
        if (!step.text?.trim()) {
          ctx.addIssue({ code: 'custom', message: 'type step requires text', path: ['text'] })
        }
        if (!step.ref?.trim() && !step.selector?.trim()) {
          ctx.addIssue({
            code: 'custom',
            message: 'type step requires ref or selector',
            path: ['ref'],
          })
        }
        break
      case 'press':
        if (!step.key?.trim()) {
          ctx.addIssue({ code: 'custom', message: 'press step requires key', path: ['key'] })
        }
        break
      case 'wait':
        if (!step.text?.trim() && !step.timeMs) {
          ctx.addIssue({
            code: 'custom',
            message: 'wait step requires text or timeMs',
            path: ['text'],
          })
        }
        break
      default:
        break
    }
  })

export const playwrightRunBodySchema = z.object({
  steps: z.array(playwrightStepSchema).min(1, 'At least one step is required').max(50),
  headless: z.boolean().optional().default(true),
  timeoutMs: z.number().int().min(5_000).max(300_000).optional(),
})

export const playwrightStepResultSchema = z.object({
  type: playwrightStepSchema.shape.type,
  success: z.boolean(),
  url: z.string().optional(),
  snapshot: z.string().optional(),
  screenshot: z.string().optional(),
  error: z.string().optional(),
})

export const playwrightRunOutputSchema = z.object({
  stepResults: z.array(playwrightStepResultSchema),
  finalSnapshot: z.string().optional(),
  finalUrl: z.string().optional(),
})

export const playwrightRunContract = defineRouteContract({
  method: 'POST',
  path: '/api/tools/playwright/run',
  body: playwrightRunBodySchema,
  response: {
    mode: 'json',
    schema: z.union([
      toolSuccessResponseSchema(playwrightRunOutputSchema),
      toolFailureResponseSchema,
    ]),
  },
})

export type PlaywrightRunBody = z.input<typeof playwrightRunBodySchema>
export type PlaywrightRunOutput = z.output<typeof playwrightRunOutputSchema>

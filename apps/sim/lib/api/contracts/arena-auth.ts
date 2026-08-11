import { z } from 'zod'
import type { ContractJsonResponse } from '@/lib/api/contracts/types'
import { defineRouteContract } from '@/lib/api/contracts/types'

/**
 * Arena hub sends either standard `Authorization` or Arena's `Authorisation`
 * header (raw JWT or `Bearer <jwt>`). Fetch lowercases header names.
 */
export const createArenaSessionHeadersSchema = z
  .object({
    authorization: z.string().min(1).optional(),
    authorisation: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.authorization?.trim() && !value.authorisation?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Authorization header is required',
        path: ['authorization'],
      })
    }
  })

export type CreateArenaSessionHeaders = z.input<typeof createArenaSessionHeadersSchema>

export const createArenaSessionResponseSchema = z.object({
  success: z.literal(true),
  email: z.string().email(),
})

/**
 * Exchanges a validated Arena JWT for a Better Auth session (Set-Cookie).
 * Called from the Arena hub so the agent host can mint host-scoped cookies.
 */
export const createArenaSessionContract = defineRouteContract({
  method: 'POST',
  path: '/api/auth/arena/session',
  headers: createArenaSessionHeadersSchema,
  response: {
    mode: 'json',
    schema: createArenaSessionResponseSchema,
  },
})

export type CreateArenaSessionResponse = ContractJsonResponse<typeof createArenaSessionContract>

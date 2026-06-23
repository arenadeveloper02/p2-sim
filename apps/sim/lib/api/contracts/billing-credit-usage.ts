import { z } from 'zod'
import { defineRouteContract } from '@/lib/api/contracts'
import { workspaceIdSchema } from '@/lib/api/contracts/primitives'

export const creditUsageBreakdownSchema = z.object({
  totalCredits: z.number(),
  mothershipCredits: z.number(),
  workflowCredits: z.number(),
  otherCredits: z.number(),
})

export const memberCreditUsageRowSchema = z.object({
  userId: z.string(),
  userName: z.string(),
  userEmail: z.string(),
  totalCredits: z.number(),
  mothershipCredits: z.number(),
  workflowCredits: z.number(),
  otherCredits: z.number(),
})

export const creditUsageSummarySchema = z.object({
  scope: z.enum(['personal', 'organization']),
  billingPeriodStart: z.string().nullable(),
  billingPeriodEnd: z.string().nullable(),
  billingInterval: z.enum(['month', 'year']),
  summary: creditUsageBreakdownSchema,
  members: z.array(memberCreditUsageRowSchema).optional(),
})

export const getCreditUsageSummaryContract = defineRouteContract({
  method: 'GET',
  path: '/api/billing/credit-usage',
  query: z.object({
    workspaceId: workspaceIdSchema,
  }),
  response: {
    mode: 'json',
    schema: z.object({
      success: z.boolean(),
      data: creditUsageSummarySchema,
    }),
  },
})

export type CreditUsageSummary = z.infer<typeof creditUsageSummarySchema>
export type CreditUsageBreakdown = z.infer<typeof creditUsageBreakdownSchema>
export type MemberCreditUsageRow = z.infer<typeof memberCreditUsageRowSchema>

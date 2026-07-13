import { z } from 'zod'
import { organizationParamsSchema } from '@/lib/api/contracts/organization'
import { defineRouteContract } from '@/lib/api/contracts/types'
import {
  usageActorTypeSchema,
  usageLogSourceSchema,
  workspaceUsagePeriodSchema,
} from '@/lib/api/contracts/workspace-usage'

export const organizationUsageAnalyticsQuerySchema = z.object({
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  period: workspaceUsagePeriodSchema.optional().default('30d'),
  sources: z.string().optional(),
  allTime: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
})

export type OrganizationUsageAnalyticsQuery = z.input<typeof organizationUsageAnalyticsQuerySchema>
export type OrganizationUsageAnalyticsQueryOutput = z.output<
  typeof organizationUsageAnalyticsQuerySchema
>

const costBucketSchema = z.object({
  billableCost: z.number(),
  rawCost: z.number(),
  count: z.number().int().nonnegative(),
})

const usageMetricsSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  invocationCount: z.number().int().nonnegative(),
})

const dataHealthWarningSchema = z.object({
  id: z.string(),
  severity: z.enum(['warning', 'error']),
  label: z.string(),
  count: z.number().int().nonnegative(),
  detail: z.string().optional(),
})

export const organizationUsageAnalyticsResponseSchema = z.object({
  period: z.object({
    startTime: z.string(),
    endTime: z.string(),
  }),
  workspaces: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    })
  ),
  summary: z.object({
    billableCost: z.number(),
    rawCost: z.number(),
    billableCostCredits: z.number().int(),
    ledgerEntryCount: z.number().int().nonnegative(),
    executionCount: z.number().int().nonnegative(),
    chatCount: z.number().int().nonnegative(),
    runCount: z.number().int().nonnegative(),
    usage: usageMetricsSchema,
  }),
  byWorkspace: z.array(
    costBucketSchema.extend({
      workspaceId: z.string(),
      workspaceName: z.string(),
      usage: usageMetricsSchema,
    })
  ),
  workflow: z.object({
    byWorkflow: z.array(
      costBucketSchema.extend({
        workspaceId: z.string(),
        workspaceName: z.string(),
        workflowId: z.string().nullable(),
        workflowName: z.string().nullable(),
        executionCount: z.number().int().nonnegative(),
      })
    ),
  }),
  copilot: z.object({
    byChat: z.array(
      costBucketSchema.extend({
        workspaceId: z.string(),
        workspaceName: z.string(),
        chatId: z.string(),
        title: z.string().nullable(),
        chatType: z.enum(['mothership', 'copilot']),
        userId: z.string(),
        runCount: z.number().int().nonnegative(),
      })
    ),
  }),
  byActor: z.array(
    costBucketSchema.extend({
      actorUserId: z.string().nullable(),
      actorType: usageActorTypeSchema.nullable(),
      usage: usageMetricsSchema,
    })
  ),
  byUser: z.array(
    costBucketSchema.extend({
      userId: z.string(),
    })
  ),
  bySource: z.array(
    costBucketSchema.extend({
      source: usageLogSourceSchema,
      usage: usageMetricsSchema,
    })
  ),
  timeSeries: z.array(
    z.object({
      bucketStart: z.string(),
      billableCost: z.number(),
      rawCost: z.number(),
      executionCount: z.number().int().nonnegative(),
      usage: usageMetricsSchema,
    })
  ),
  dataHealth: z.object({
    limitedAttribution: z.boolean(),
    warnings: z.array(dataHealthWarningSchema),
  }),
})

export type OrganizationUsageAnalytics = z.output<typeof organizationUsageAnalyticsResponseSchema>

export const getOrganizationUsageAnalyticsContract = defineRouteContract({
  method: 'GET',
  path: '/api/organizations/[id]/usage',
  params: organizationParamsSchema,
  query: organizationUsageAnalyticsQuerySchema,
  response: {
    mode: 'json',
    schema: organizationUsageAnalyticsResponseSchema,
  },
})

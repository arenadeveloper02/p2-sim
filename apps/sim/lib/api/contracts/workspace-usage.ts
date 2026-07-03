import { z } from 'zod'
import { defineRouteContract } from '@/lib/api/contracts/types'
import { workspaceParamsSchema } from '@/lib/api/contracts/workspaces'

export const usageLogSourceSchema = z.enum([
  'workflow',
  'wand',
  'copilot',
  'workspace-chat',
  'mcp_copilot',
  'mothership_block',
  'knowledge-base',
  'voice-input',
  'enrichment',
])

export type UsageLogSourceValue = z.output<typeof usageLogSourceSchema>

export const workspaceUsagePeriodSchema = z.enum(['1d', '7d', '30d', '90d'])

export const workspaceUsageAnalyticsQuerySchema = z.object({
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  period: workspaceUsagePeriodSchema.optional().default('30d'),
  sources: z.string().optional(),
  allTime: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
})

export type WorkspaceUsageAnalyticsQuery = z.input<typeof workspaceUsageAnalyticsQuerySchema>
export type WorkspaceUsageAnalyticsQueryOutput = z.output<typeof workspaceUsageAnalyticsQuerySchema>

const costBucketSchema = z.object({
  billableCost: z.number(),
  rawCost: z.number(),
  count: z.number().int().nonnegative(),
})

export const workspaceUsageAnalyticsResponseSchema = z.object({
  period: z.object({
    startTime: z.string(),
    endTime: z.string(),
  }),
  summary: z.object({
    billableCost: z.number(),
    rawCost: z.number(),
    billableCostCredits: z.number().int(),
    ledgerEntryCount: z.number().int().nonnegative(),
    executionCount: z.number().int().nonnegative(),
    chatCount: z.number().int().nonnegative(),
    runCount: z.number().int().nonnegative(),
  }),
  bySource: z.array(
    costBucketSchema.extend({
      source: usageLogSourceSchema,
    })
  ),
  attribution: z.object({
    missingChatId: costBucketSchema,
    missingExecutionId: costBucketSchema,
  }),
  workflow: z.object({
    executions: z.object({
      total: z.number().int().nonnegative(),
      withProjectedCost: z.number().int().nonnegative(),
      totalProjectedCost: z.number(),
      totalLedgerCost: z.number(),
    }),
    byTrigger: z.array(
      costBucketSchema.extend({
        trigger: z.string(),
        executionCount: z.number().int().nonnegative(),
      })
    ),
    byWorkflow: z.array(
      costBucketSchema.extend({
        workflowId: z.string().nullable(),
        workflowName: z.string().nullable(),
        executionCount: z.number().int().nonnegative(),
      })
    ),
  }),
  copilot: z.object({
    chats: z.object({
      total: z.number().int().nonnegative(),
      withLedgerCost: z.number().int().nonnegative(),
    }),
    runs: z.object({
      total: z.number().int().nonnegative(),
    }),
    byChatType: z.array(
      costBucketSchema.extend({
        chatType: z.enum(['mothership', 'copilot']),
        chatCount: z.number().int().nonnegative(),
        runCount: z.number().int().nonnegative(),
      })
    ),
    byModel: z.array(
      costBucketSchema.extend({
        model: z.string(),
      })
    ),
  }),
  byUser: z.array(
    costBucketSchema.extend({
      userId: z.string(),
    })
  ),
  byModel: z.array(
    costBucketSchema.extend({
      model: z.string(),
    })
  ),
  byProvider: z.array(
    costBucketSchema.extend({
      provider: z.string(),
    })
  ),
  byTool: z.array(
    costBucketSchema.extend({
      toolId: z.string(),
    })
  ),
})

export type WorkspaceUsageAnalytics = z.output<typeof workspaceUsageAnalyticsResponseSchema>

export const getWorkspaceUsageAnalyticsContract = defineRouteContract({
  method: 'GET',
  path: '/api/workspaces/[id]/usage',
  params: workspaceParamsSchema,
  query: workspaceUsageAnalyticsQuerySchema,
  response: {
    mode: 'json',
    schema: workspaceUsageAnalyticsResponseSchema,
  },
})

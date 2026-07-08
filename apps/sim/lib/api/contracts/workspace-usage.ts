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

export const usageActorTypeSchema = z.enum(['user', 'api_key', 'webhook', 'schedule'])

export type UsageActorTypeValue = z.output<typeof usageActorTypeSchema>

/** High-level charge buckets for total-cost division (base run, LLM, tools, Cost blocks). */
export const usageChargeTypeSchema = z.enum([
  'base_run',
  'provider',
  'tool',
  'cost_block',
  'other',
])

export type UsageChargeTypeValue = z.output<typeof usageChargeTypeSchema>

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
  rootExecutionId: z.string().min(1).optional(),
})

export type WorkspaceUsageAnalyticsQuery = z.input<typeof workspaceUsageAnalyticsQuerySchema>
export type WorkspaceUsageAnalyticsQueryOutput = z.output<typeof workspaceUsageAnalyticsQuerySchema>

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
    usage: usageMetricsSchema,
  }),
  bySource: z.array(
    costBucketSchema.extend({
      source: usageLogSourceSchema,
      usage: usageMetricsSchema,
    })
  ),
  byChargeType: z.array(
    costBucketSchema.extend({
      chargeType: usageChargeTypeSchema,
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
    triggeredWorkflows: z.object({
      executionCount: z.number().int().nonnegative(),
      billableCost: z.number(),
      rawCost: z.number(),
      byChat: z.array(
        z.object({
          triggeringChatId: z.string(),
          executionCount: z.number().int().nonnegative(),
          billableCost: z.number(),
          rawCost: z.number(),
        })
      ),
    }),
  }),
  byUser: z.array(
    costBucketSchema.extend({
      userId: z.string(),
    })
  ),
  byActor: z.array(
    costBucketSchema.extend({
      actorUserId: z.string().nullable(),
      actorType: usageActorTypeSchema.nullable(),
      usage: usageMetricsSchema,
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
  byVendor: z.array(
    costBucketSchema.extend({
      vendor: z.string(),
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
  lineage: z.object({
    roots: z.array(
      z.object({
        rootExecutionId: z.string(),
        executionCount: z.number().int().nonnegative(),
        inclusiveBillableCost: z.number(),
        inclusiveRawCost: z.number(),
      })
    ),
    drillDown: z
      .object({
        rootExecutionId: z.string(),
        inclusiveBillableCost: z.number(),
        inclusiveRawCost: z.number(),
        executions: z.array(
          z.object({
            executionId: z.string(),
            parentExecutionId: z.string().nullable(),
            workflowId: z.string().nullable(),
            workflowName: z.string().nullable(),
            startedAt: z.string(),
            trigger: z.string(),
            billableCost: z.number(),
            rawCost: z.number(),
            actorUserId: z.string().nullable(),
            actorType: usageActorTypeSchema.nullable(),
          })
        ),
      })
      .optional(),
  }),
  dataHealth: z.object({
    limitedAttribution: z.boolean(),
    warnings: z.array(dataHealthWarningSchema),
  }),
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

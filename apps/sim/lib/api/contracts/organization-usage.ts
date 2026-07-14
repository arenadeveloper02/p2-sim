import { z } from 'zod'
import { organizationParamsSchema } from '@/lib/api/contracts/organization'
import { workspaceIdSchema } from '@/lib/api/contracts/primitives'
import { defineRouteContract } from '@/lib/api/contracts/types'
import {
  usageActorTypeSchema,
  usageChargeTypeSchema,
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
  /** Optional subset: one active org workspace. Omit for all org workspaces. */
  workspaceId: workspaceIdSchema.optional(),
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
  /** All active org workspaces (for filter UI). Analytics may be scoped via `workspaceId`. */
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
    /** Distinct human actors (resolved actor_type = user) across the period. */
    activeUserCount: z.number().int().nonnegative(),
    usage: usageMetricsSchema,
  }),
  byWorkspace: z.array(
    costBucketSchema.extend({
      workspaceId: z.string(),
      workspaceName: z.string(),
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
    /** Most expensive workflows across the scoped org workspaces (top N). */
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
    /**
     * Most expensive mothership/copilot chats (top N), with workspace for deep-links.
     * Default keeps older API payloads that omitted this field from failing client
     * contract validation (which would drop the entire usage response).
     */
    byChat: z
      .array(
        costBucketSchema.extend({
          workspaceId: z.string(),
          workspaceName: z.string(),
          chatId: z.string(),
          title: z.string().nullable(),
          chatType: z.enum(['mothership', 'copilot']),
          userId: z.string(),
          runCount: z.number().int().nonnegative(),
        })
      )
      .default([]),
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
          workspaceId: z.string(),
          workspaceName: z.string(),
          triggeringChatId: z.string(),
          executionCount: z.number().int().nonnegative(),
          billableCost: z.number(),
          rawCost: z.number(),
        })
      ),
    }),
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
      /** Distinct human actors in this bucket (resolved actor_type = user). */
      activeUserCount: z.number().int().nonnegative(),
      usage: usageMetricsSchema,
    })
  ),
  /**
   * Lineage roots only — drill-down happens via workspace Usage deep-link
   * (`rootExecutionId`), not merged trees in the org API.
   */
  lineage: z.object({
    roots: z.array(
      z.object({
        workspaceId: z.string(),
        workspaceName: z.string(),
        rootExecutionId: z.string(),
        executionCount: z.number().int().nonnegative(),
        inclusiveBillableCost: z.number(),
        inclusiveRawCost: z.number(),
      })
    ),
  }),
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

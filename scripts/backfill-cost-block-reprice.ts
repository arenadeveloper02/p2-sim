#!/usr/bin/env bun
/**
 * Legacy cron + one-shot backfill for Cost block external spend.
 *
 * Discovers workflows with Cost blocks, recomputes `category=external` ledger rows
 * for completed runs, and refreshes `workflow_execution_logs.cost_total`.
 *
 * ## Pricing sources (what this script reprices vs what it does not)
 *
 * | Cost type | Priced at execution by | Source of rates |
 * |-----------|------------------------|-----------------|
 * | Cost block (`external`) | CostBlockHandler | **Workflow editor** — `workflow_blocks.sub_blocks` on each Cost block: fixed amount, per-unit price × units path, response path, expression, currency + manual exchange rate |
 * | LLM models (`model`) | providers/* + calculateCost | `apps/sim/providers/models.ts` (+ `USAGE_LOG_COST_MULTIPLIER`) |
 * | Hosted tools (`tool`) | applyHostedKeyCostToResult | Tool `hosting.pricing` + `apps/sim/config/vendor-pricing.json` |
 * | Base run fee (`fixed` / execution_fee) | logging-factory | `BASE_EXECUTION_CHARGE` in `apps/sim/lib/billing/constants.ts` ($0.005) |
 * | Copilot / mothership chat | Go stream → /api/billing/update-cost | Go mothership pricing (outside this repo) |
 *
 * This script ONLY reprices Cost block external rows. It does not reprice models/tools.
 *
 * Reprice inputs:
 * - **Rates**: current Cost block `sub_blocks` on the workflow (not the snapshot at run time)
 * - **Units / amounts**: historical upstream outputs from materialized `execution_data.traceSpans`
 *
 * ## Usage
 *
 * One-shot / manual:
 *   bun --env-file=apps/sim/.env run scripts/backfill-cost-block-reprice.ts --discover
 *   bun --env-file=apps/sim/.env run scripts/backfill-cost-block-reprice.ts --dry-run
 *   bun --env-file=apps/sim/.env run scripts/backfill-cost-block-reprice.ts --apply
 *   bun --env-file=apps/sim/.env run scripts/backfill-cost-block-reprice.ts --apply --legacy-all
 *
 * Legacy cron (nightly catch-up; idempotent — safe to re-run):
 *   bun --env-file=apps/sim/.env run scripts/backfill-cost-block-reprice.ts --cron
 *
 * Example crontab:
 *   0 2 * * * cd /path/to/p2-sim && bun --env-file=apps/sim/.env run scripts/backfill-cost-block-reprice.ts --cron >> /var/log/cost-block-reprice.log 2>&1
 *
 * Env overrides for cron:
 *   COST_REPRICE_CRON_LOOKBACK_DAYS=90
 *   COST_REPRICE_CRON_BATCH_SIZE=500
 */

import { db } from '@sim/db'
import { usageLog, workflow, workflowExecutionLogs } from '@sim/db/schema'
import { getErrorMessage } from '@sim/utils/errors'
import { and, eq, sql } from 'drizzle-orm'
import {
  deriveBillingContext,
  recordUsage,
} from '../apps/sim/lib/billing/core/usage-log'
import { getHighestPrioritySubscription } from '../apps/sim/lib/billing/core/subscription'
import {
  discoverWorkflowsWithCostBlocks,
  listCompletedExecutionsForWorkflow,
  listCostBlockExecutionsForReprice,
  listWorkflowsWithCostBlockExecutions,
  loadWorkflowGraph,
  repriceExecution,
  type CostBlockWorkflowSummary,
} from '../apps/sim/lib/billing/core/cost-block-reprice'

const DEFAULT_CRON_LOOKBACK_DAYS = 90
const DEFAULT_CRON_BATCH_SIZE = 500
const DEFAULT_LEGACY_ALL_BATCH_SIZE = 2_000

interface Options {
  discover: boolean
  dryRun: boolean
  apply: boolean
  cron: boolean
  legacyAll: boolean
  workflowId?: string
  since?: Date
  until?: Date
  limit?: number
  batchSize: number
  missingOnly: boolean
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw?.trim()) return fallback
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function parseArgs(argv: string[]): Options {
  const discover = argv.includes('--discover')
  const cron = argv.includes('--cron')
  const legacyAll = argv.includes('--legacy-all')
  const apply = argv.includes('--apply') || cron
  const dryRun = argv.includes('--dry-run') || (!apply && !discover && !cron)
  const missingOnly = !argv.includes('--reprice-all') && !cron && !legacyAll

  const workflowId = argv.find((arg) => arg.startsWith('--workflow-id='))?.split('=')[1]
  const sinceRaw = argv.find((arg) => arg.startsWith('--since='))?.split('=')[1]
  const untilRaw = argv.find((arg) => arg.startsWith('--until='))?.split('=')[1]
  const limitRaw = argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1]
  const batchSizeRaw = argv.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1]
  const lookbackDaysRaw = argv.find((arg) => arg.startsWith('--lookback-days='))?.split('=')[1]

  let since: Date | undefined = sinceRaw ? new Date(`${sinceRaw}T00:00:00.000Z`) : undefined
  const until = untilRaw ? new Date(`${untilRaw}T00:00:00.000Z`) : undefined
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined

  let batchSize = batchSizeRaw
    ? Number.parseInt(batchSizeRaw, 10)
    : cron
      ? readPositiveIntEnv('COST_REPRICE_CRON_BATCH_SIZE', DEFAULT_CRON_BATCH_SIZE)
      : legacyAll
        ? DEFAULT_LEGACY_ALL_BATCH_SIZE
        : Number.POSITIVE_INFINITY

  if (cron && !sinceRaw) {
    const lookbackDays = lookbackDaysRaw
      ? Number.parseInt(lookbackDaysRaw, 10)
      : readPositiveIntEnv('COST_REPRICE_CRON_LOOKBACK_DAYS', DEFAULT_CRON_LOOKBACK_DAYS)
    if (!Number.isFinite(lookbackDays) || lookbackDays <= 0) {
      throw new Error('--lookback-days must be a positive integer')
    }
    since = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000)
  }

  if (sinceRaw && Number.isNaN(since?.getTime())) {
    throw new Error(`Invalid --since=${sinceRaw}`)
  }
  if (untilRaw && Number.isNaN(until?.getTime())) {
    throw new Error(`Invalid --until=${untilRaw}`)
  }
  if (limitRaw && (!limit || limit <= 0)) {
    throw new Error('--limit must be a positive integer')
  }
  if (batchSizeRaw && (!batchSize || batchSize <= 0)) {
    throw new Error('--batch-size must be a positive integer')
  }
  if (apply && discover) {
    throw new Error('Use either --discover or --apply/--dry-run/--cron, not both')
  }

  return {
    discover,
    dryRun,
    apply,
    cron,
    legacyAll,
    workflowId,
    since,
    until,
    limit,
    batchSize,
    missingOnly,
  }
}

async function resolveBillingUserId(workflowId: string): Promise<string | null> {
  const [row] = await db
    .select({ userId: workflow.userId })
    .from(workflow)
    .where(eq(workflow.id, workflowId))
    .limit(1)
  return row?.userId ?? null
}

async function applyExecutionAdjustments(params: {
  workflowId: string
  workspaceId: string
  executionId: string
  userId: string
  startedAt: Date
  deltas: Awaited<ReturnType<typeof repriceExecution>>['deltas']
}): Promise<void> {
  if (params.deltas.length === 0) {
    return
  }

  const billingContext = deriveBillingContext(
    params.userId,
    await getHighestPrioritySubscription(params.userId)
  )

  await db.transaction(async (tx) => {
    await recordUsage({
      userId: params.userId,
      entries: params.deltas,
      workspaceId: params.workspaceId,
      workflowId: params.workflowId,
      executionId: params.executionId,
      occurredAt: params.startedAt,
      tx,
      billingEntity: billingContext.billingEntity,
      billingPeriod: billingContext.billingPeriod,
    })

    const [ledgerRow] = await tx
      .select({ cost: sql<string>`COALESCE(SUM(${usageLog.cost}), 0)` })
      .from(usageLog)
      .where(and(eq(usageLog.executionId, params.executionId), eq(usageLog.source, 'workflow')))

    const ledgerSum = Number.parseFloat(ledgerRow?.cost ?? '0')
    await tx
      .update(workflowExecutionLogs)
      .set({ costTotal: ledgerSum.toString() })
      .where(eq(workflowExecutionLogs.executionId, params.executionId))
  })
}

async function runDiscover(): Promise<void> {
  const workflows = await discoverWorkflowsWithCostBlocks()
  const executionCounts = await listWorkflowsWithCostBlockExecutions(
    workflows.map((item) => item.workflowId)
  )

  console.log(`\nFound ${workflows.length} workflow(s) with Cost block(s):\n`)
  for (const item of workflows) {
    console.log(
      [
        `- ${item.workflowName}`,
        `workflowId=${item.workflowId}`,
        `workspaceId=${item.workspaceId ?? 'null'}`,
        `costBlocks=${item.costBlockCount} [${item.costBlockNames.join(', ')}]`,
        `completedRuns=${executionCounts.get(item.workflowId) ?? 0}`,
      ].join(' | ')
    )
  }
  console.log('')
}

interface ExecutionWorkItem {
  executionId: string
  workflowId: string
  workspaceId: string
  startedAt: Date
}

async function collectExecutionWorkItems(
  options: Options,
  workflows: CostBlockWorkflowSummary[]
): Promise<ExecutionWorkItem[]> {
  if (options.workflowId) {
    const item = workflows.find((workflow) => workflow.workflowId === options.workflowId)
    if (!item) return []
    const executions = await listCompletedExecutionsForWorkflow({
      workflowId: item.workflowId,
      since: options.since,
      until: options.until,
      limit: options.limit ?? options.batchSize,
    })
    return executions.map((execution) => ({
      ...execution,
      workflowId: item.workflowId,
    }))
  }

  const workflowIds = workflows.map((item) => item.workflowId)
  const executions = await listCostBlockExecutionsForReprice({
    workflowIds,
    since: options.since,
    until: options.until,
    limit: options.limit ?? options.batchSize,
  })

  return executions
}

async function runReprice(options: Options): Promise<void> {
  const workflows = await discoverWorkflowsWithCostBlocks()
  const workflowById = new Map(workflows.map((item) => [item.workflowId, item]))
  const selected = options.workflowId
    ? workflows.filter((item) => item.workflowId === options.workflowId)
    : workflows

  if (selected.length === 0) {
    throw new Error(
      options.workflowId
        ? `No Cost-block workflow found for workflow-id=${options.workflowId}`
        : 'No workflows with Cost blocks found'
    )
  }

  const modeLabel = options.apply ? 'APPLY' : 'DRY-RUN'
  const scopeLabel = options.missingOnly ? 'missing-only' : 'reprice-all'
  const runKind = options.cron ? 'CRON' : options.legacyAll ? 'LEGACY-ALL' : 'MANUAL'
  console.log(
    `\nCost block reprice backfill (${runKind}, ${modeLabel}, ${scopeLabel}) — ${selected.length} workflow(s)\n`
  )
  if (options.since) {
    console.log(`Window: started_at >= ${options.since.toISOString()}`)
  }
  if (options.until) {
    console.log(`Window: started_at < ${options.until.toISOString()}`)
  }
  console.log(`Batch limit: ${options.limit ?? options.batchSize}\n`)

  const executions = await collectExecutionWorkItems(options, selected)
  console.log(`Queued ${executions.length} completed execution(s) for reprice\n`)

  const graphCache = new Map<string, Awaited<ReturnType<typeof loadWorkflowGraph>>>()
  const billingUserCache = new Map<string, string | null>()

  let processed = 0
  let adjusted = 0
  let skipped = 0
  let unchanged = 0
  let errored = 0
  let deltaTotal = 0

  for (const execution of executions) {
    const item = workflowById.get(execution.workflowId)
    if (!item) {
      errored += 1
      continue
    }

    processed += 1
    if (!graphCache.has(execution.workflowId)) {
      graphCache.set(execution.workflowId, await loadWorkflowGraph(execution.workflowId))
    }

    const result = await repriceExecution({
      workflowId: execution.workflowId,
      executionId: execution.executionId,
      workspaceId: execution.workspaceId,
      costBlockIds: item.costBlockIds,
      graph: graphCache.get(execution.workflowId),
      missingOnly: options.missingOnly,
    })

    if (result.status === 'adjusted') {
      adjusted += 1
      const executionDelta = result.deltas.reduce((sum, entry) => sum + entry.cost, 0)
      deltaTotal += executionDelta
      console.log(
        `  ✓ ${execution.executionId} | delta=$${executionDelta.toFixed(6)} | ledger $${result.ledgerSumBefore.toFixed(6)} → $${result.ledgerSumAfter.toFixed(6)}`
      )
      for (const target of result.targets) {
        console.log(
          `      target ${target.description}: $${target.target.toFixed(6)}${target.quantity != null ? ` (${target.quantity} ${target.unit ?? 'units'})` : ''}`
        )
      }

      if (options.apply) {
        if (!billingUserCache.has(execution.workflowId)) {
          billingUserCache.set(
            execution.workflowId,
            await resolveBillingUserId(execution.workflowId)
          )
        }
        const billingUserId = billingUserCache.get(execution.workflowId)
        if (!billingUserId) {
          errored += 1
          console.log(`      ✗ skipped apply — billing user not found`)
          continue
        }
        await applyExecutionAdjustments({
          workflowId: execution.workflowId,
          workspaceId: execution.workspaceId,
          executionId: execution.executionId,
          userId: billingUserId,
          startedAt: execution.startedAt,
          deltas: result.deltas,
        })
      }
    } else if (result.status === 'unchanged') {
      unchanged += 1
    } else if (result.status === 'skipped') {
      skipped += 1
      if (result.reason !== 'external_rows_already_present') {
        console.log(`  - ${execution.executionId} skipped (${result.reason ?? 'unknown'})`)
      }
    } else {
      errored += 1
      console.log(`  ✗ ${execution.executionId} error (${result.reason ?? 'unknown'})`)
    }
  }

  console.log('\n--- summary ---')
  console.log(`processed: ${processed}`)
  console.log(`adjusted:  ${adjusted}`)
  console.log(`unchanged: ${unchanged}`)
  console.log(`skipped:   ${skipped}`)
  console.log(`errors:    ${errored}`)
  console.log(`delta USD: $${deltaTotal.toFixed(6)}`)
  if (options.cron && executions.length >= options.batchSize) {
    console.log(
      '\nCron batch limit reached — re-run on schedule to continue scanning the lookback window.'
    )
  }
  console.log(options.apply ? '\nApplied ledger adjustments.\n' : '\nDry run only — no DB writes.\n')
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (options.discover) {
    await runDiscover()
    return
  }

  await runReprice(options)
}

main().catch((error) => {
  console.error('\nCost block reprice backfill failed:\n', getErrorMessage(error, 'unknown error'))
  process.exit(1)
})

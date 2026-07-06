#!/usr/bin/env bun
/**
 * Phase 4 cheap backfill for usage attribution and lineage columns.
 *
 * Idempotent, batched updates — safe to re-run after partial failure:
 *   1. usage_log.workspace_id from workflow.workspace_id
 *   2. usage_log.occurred_at from workflow_execution_logs.started_at (else created_at)
 *   3. actor_user_id / actor_type heuristics on workflow_execution_logs + usage_log
 *   4. provider / tool_id / canonical model normalization on usage_log
 *
 * Usage:
 *   bun --env-file=apps/sim/.env run scripts/backfill-usage-attribution.ts
 *   bun --env-file=apps/sim/.env run scripts/backfill-usage-attribution.ts --dry-run
 *   bun --env-file=apps/sim/.env run scripts/backfill-usage-attribution.ts --step=workspace
 *   bun --env-file=apps/sim/.env run scripts/backfill-usage-attribution.ts --step=normalize --batch-size=500
 */

import { db } from '@sim/db'
import { usageLog } from '@sim/db/schema'
import { getErrorMessage } from '@sim/utils/errors'
import { and, asc, eq, gt, inArray, sql } from 'drizzle-orm'
import {
  normalizeUsageLogRowForBackfill,
  resolveBackfillActorFromTrigger,
} from '../apps/sim/lib/billing/core/usage-attribution-backfill.ts'

const DEFAULT_BATCH_SIZE = 5000

type BackfillStep = 'workspace' | 'occurred' | 'actor' | 'normalize' | 'all'

interface Options {
  dryRun: boolean
  batchSize: number
  maxBatches: number
  step: BackfillStep
}

interface StepStats {
  updated: number
  batches: number
}

function parseArgs(argv: string[]): Options {
  const dryRun = argv.includes('--dry-run')
  const stepArg = argv.find((a) => a.startsWith('--step='))
  const batchArg = argv.find((a) => a.startsWith('--batch-size='))
  const maxBatchesArg = argv.find((a) => a.startsWith('--max-batches='))

  const stepRaw = stepArg?.split('=')[1] ?? 'all'
  const validSteps: BackfillStep[] = ['workspace', 'occurred', 'actor', 'normalize', 'all']
  if (!validSteps.includes(stepRaw as BackfillStep)) {
    throw new Error(`Invalid --step=${stepRaw}. Expected one of: ${validSteps.join(', ')}`)
  }

  const batchSize = batchArg
    ? Number.parseInt(batchArg.split('=')[1] ?? '', 10)
    : DEFAULT_BATCH_SIZE
  const maxBatches = maxBatchesArg
    ? Number.parseInt(maxBatchesArg.split('=')[1] ?? '', 10)
    : Number.POSITIVE_INFINITY

  if (!Number.isFinite(batchSize) || batchSize <= 0) {
    throw new Error('--batch-size must be a positive integer')
  }
  if (maxBatchesArg && (!Number.isFinite(maxBatches) || maxBatches <= 0)) {
    throw new Error('--max-batches must be a positive integer')
  }

  return {
    dryRun,
    batchSize,
    maxBatches,
    step: stepRaw as BackfillStep,
  }
}

function shouldRun(step: BackfillStep, target: BackfillStep): boolean {
  return step === 'all' || step === target
}

/** postgres-js driver returns row objects at numeric indices with a `count` field. */
function queryRows<T>(result: T[] & { count?: number }): T[] {
  const n = result.count ?? 0
  const rows: T[] = []
  for (let i = 0; i < n; i++) {
    const row = result[i]
    if (row != null) rows.push(row)
  }
  return rows
}

async function assertAttributionColumnsExist(step: BackfillStep) {
  const needsOccurred = shouldRun(step, 'occurred')
  const needsActor = shouldRun(step, 'actor')

  if (!needsOccurred && !needsActor) {
    return
  }

  const rows = queryRows(
    await db.execute<{ usage_actor: boolean; wel_actor: boolean; occurred_at: boolean }>(sql`
      SELECT
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'usage_log'
            AND column_name = 'actor_type'
        ) AS usage_actor,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'workflow_execution_logs'
            AND column_name = 'actor_type'
        ) AS wel_actor,
        EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'usage_log'
            AND column_name = 'occurred_at'
        ) AS occurred_at
    `)
  )

  const row = rows[0]
  const missing: string[] = []
  if (needsOccurred && !row?.occurred_at) missing.push('usage_log.occurred_at')
  if (needsActor && !row?.usage_actor) missing.push('usage_log.actor_type')
  if (needsActor && !row?.wel_actor) missing.push('workflow_execution_logs.actor_type')

  if (missing.length > 0) {
    throw new Error(
      `Missing attribution columns (${missing.join(', ')}). Apply migration 0250_usage_attribution_lineage before running this backfill.`
    )
  }
}

async function countScalar(sqlText: ReturnType<typeof sql>): Promise<number> {
  const rows = queryRows(await db.execute<{ count: string }>(sqlText))
  return Number.parseInt(rows[0]?.count ?? '0', 10)
}

async function backfillWorkspaceId(batchSize: number, maxBatches: number, dryRun: boolean) {
  const stats: StepStats = { updated: 0, batches: 0 }
  const pendingBefore = await countScalar(sql`
    SELECT count(*)::text AS count
    FROM usage_log ul
    INNER JOIN workflow w ON w.id = ul.workflow_id
    WHERE ul.workspace_id IS NULL
      AND ul.workflow_id IS NOT NULL
  `)

  console.log(`\n--- workspace_id (${pendingBefore} pending)${dryRun ? ' [DRY RUN]' : ''} ---`)

  for (let batch = 0; batch < maxBatches; batch++) {
    if (dryRun) {
      const sample = queryRows(
        await db.execute<{ id: string }>(sql`
          SELECT ul.id
          FROM usage_log ul
          INNER JOIN workflow w ON w.id = ul.workflow_id
          WHERE ul.workspace_id IS NULL
            AND ul.workflow_id IS NOT NULL
          LIMIT ${batchSize}
        `)
      )
      if (sample.length === 0) break
      stats.updated += sample.length
      stats.batches += 1
      break
    }

    const result = queryRows(
      await db.execute<{ id: string }>(sql`
        WITH candidates AS (
          SELECT ul.id, w.workspace_id AS target_workspace_id
          FROM usage_log ul
          INNER JOIN workflow w ON w.id = ul.workflow_id
          WHERE ul.workspace_id IS NULL
            AND ul.workflow_id IS NOT NULL
          LIMIT ${batchSize}
        )
        UPDATE usage_log ul
        SET workspace_id = c.target_workspace_id
        FROM candidates c
        WHERE ul.id = c.id
        RETURNING ul.id
      `)
    )

    if (result.length === 0) break
    stats.updated += result.length
    stats.batches += 1
    console.log(`  batch ${stats.batches}: updated ${result.length} (total ${stats.updated})`)
  }

  return stats
}

async function backfillOccurredAt(batchSize: number, maxBatches: number, dryRun: boolean) {
  const stats: StepStats = { updated: 0, batches: 0 }
  const pendingBefore = await countScalar(sql`
    SELECT count(*)::text AS count
    FROM usage_log ul
    WHERE ul.occurred_at IS NULL
  `)

  console.log(`\n--- occurred_at (${pendingBefore} pending)${dryRun ? ' [DRY RUN]' : ''} ---`)

  for (let batch = 0; batch < maxBatches; batch++) {
    if (dryRun) {
      const sample = queryRows(
        await db.execute<{ id: string }>(sql`
          SELECT ul.id
          FROM usage_log ul
          WHERE ul.occurred_at IS NULL
          LIMIT ${batchSize}
        `)
      )
      if (sample.length === 0) break
      stats.updated += sample.length
      stats.batches += 1
      break
    }

    const result = queryRows(
      await db.execute<{ id: string }>(sql`
        WITH candidates AS (
          SELECT
            ul.id,
            COALESCE(wel.started_at, ul.created_at) AS stamped_at
          FROM usage_log ul
          LEFT JOIN workflow_execution_logs wel
            ON wel.execution_id = ul.execution_id
          WHERE ul.occurred_at IS NULL
          LIMIT ${batchSize}
        )
        UPDATE usage_log ul
        SET occurred_at = c.stamped_at
        FROM candidates c
        WHERE ul.id = c.id
        RETURNING ul.id
      `)
    )

    if (result.length === 0) break
    stats.updated += result.length
    stats.batches += 1
    console.log(`  batch ${stats.batches}: updated ${result.length} (total ${stats.updated})`)
  }

  return stats
}

const BACKFILLABLE_TRIGGERS = ['manual', 'chat', 'copilot', 'api', 'webhook', 'schedule'] as const

async function backfillExecutionLogActors(batchSize: number, maxBatches: number, dryRun: boolean) {
  const stats: StepStats = { updated: 0, batches: 0 }
  const pendingBefore = await countScalar(sql`
    SELECT count(*)::text AS count
    FROM workflow_execution_logs
    WHERE actor_type IS NULL
      AND trigger IN ('manual', 'chat', 'copilot', 'api', 'webhook', 'schedule')
  `)

  console.log(
    `\n--- workflow_execution_logs actor (${pendingBefore} pending)${dryRun ? ' [DRY RUN]' : ''} ---`
  )

  let lastId = ''

  for (let batch = 0; batch < maxBatches; batch++) {
    const rows = queryRows(
      await db.execute<{
        id: string
        trigger: string
        user_id: string | null
      }>(sql`
        SELECT id, trigger, user_id
        FROM workflow_execution_logs
        WHERE actor_type IS NULL
          AND trigger IN (${sql.join(
            BACKFILLABLE_TRIGGERS.map((trigger) => sql`${trigger}`),
            sql`, `
          )})
          ${lastId ? sql`AND id > ${lastId}` : sql``}
        ORDER BY id
        LIMIT ${batchSize}
      `)
    )

    if (rows.length === 0) break

    lastId = rows[rows.length - 1]?.id ?? lastId

    const updates = rows
      .map((row) => {
        const actor = resolveBackfillActorFromTrigger(row.trigger, row.user_id)
        if (!actor) return null
        return { id: row.id, ...actor }
      })
      .filter((row): row is { id: string; actorType: string; actorUserId: string | null } =>
        Boolean(row)
      )

    if (dryRun) {
      stats.updated += updates.length
      stats.batches += 1
      break
    }

    if (updates.length > 0) {
      await Promise.all(
        updates.map((row) =>
          db.execute(sql`
            UPDATE workflow_execution_logs
            SET
              actor_type = ${row.actorType},
              actor_user_id = ${row.actorUserId}
            WHERE id = ${row.id}
              AND actor_type IS NULL
          `)
        )
      )
      stats.updated += updates.length
    }

    stats.batches += 1
    console.log(`  batch ${stats.batches}: updated ${updates.length} (total ${stats.updated})`)

    if (rows.length < batchSize) break
  }

  return stats
}

async function backfillUsageLogActors(batchSize: number, maxBatches: number, dryRun: boolean) {
  const stats: StepStats = { updated: 0, batches: 0 }
  const pendingBefore = await countScalar(sql`
    SELECT count(*)::text AS count
    FROM usage_log ul
    INNER JOIN workflow_execution_logs wel ON wel.execution_id = ul.execution_id
    WHERE ul.actor_type IS NULL
      AND ul.execution_id IS NOT NULL
      AND wel.trigger IN ('manual', 'chat', 'copilot', 'api', 'webhook', 'schedule')
  `)

  console.log(`\n--- usage_log actor (${pendingBefore} pending)${dryRun ? ' [DRY RUN]' : ''} ---`)

  let lastId = ''

  for (let batch = 0; batch < maxBatches; batch++) {
    const rows = queryRows(
      await db.execute<{
        id: string
        trigger: string
        user_id: string | null
      }>(sql`
        SELECT ul.id, wel.trigger, wel.user_id
        FROM usage_log ul
        INNER JOIN workflow_execution_logs wel ON wel.execution_id = ul.execution_id
        WHERE ul.actor_type IS NULL
          AND ul.execution_id IS NOT NULL
          AND wel.trigger IN (${sql.join(
            BACKFILLABLE_TRIGGERS.map((trigger) => sql`${trigger}`),
            sql`, `
          )})
          ${lastId ? sql`AND ul.id > ${lastId}` : sql``}
        ORDER BY ul.id
        LIMIT ${batchSize}
      `)
    )

    if (rows.length === 0) break

    lastId = rows[rows.length - 1]?.id ?? lastId

    const updates = rows
      .map((row) => {
        const actor = resolveBackfillActorFromTrigger(row.trigger, row.user_id)
        if (!actor) return null
        return { id: row.id, ...actor }
      })
      .filter((row): row is { id: string; actorType: string; actorUserId: string | null } =>
        Boolean(row)
      )

    if (dryRun) {
      stats.updated += updates.length
      stats.batches += 1
      break
    }

    if (updates.length > 0) {
      await Promise.all(
        updates.map((row) =>
          db.execute(sql`
            UPDATE usage_log
            SET
              actor_type = ${row.actorType},
              actor_user_id = ${row.actorUserId}
            WHERE id = ${row.id}
              AND actor_type IS NULL
          `)
        )
      )
      stats.updated += updates.length
    }

    stats.batches += 1
    console.log(`  batch ${stats.batches}: updated ${updates.length} (total ${stats.updated})`)

    if (rows.length < batchSize) break
  }

  return stats
}

async function backfillActors(batchSize: number, maxBatches: number, dryRun: boolean) {
  const executionStats = await backfillExecutionLogActors(batchSize, maxBatches, dryRun)
  const usageStats = await backfillUsageLogActors(batchSize, maxBatches, dryRun)
  return {
    updated: executionStats.updated + usageStats.updated,
    batches: executionStats.batches + usageStats.batches,
  }
}

async function backfillNormalization(batchSize: number, maxBatches: number, dryRun: boolean) {
  const stats: StepStats = { updated: 0, batches: 0 }
  const pendingBefore = await countScalar(sql`
    SELECT count(*)::text AS count
    FROM usage_log ul
    WHERE ul.category IN ('model', 'tool')
  `)

  console.log(
    `\n--- provider/tool/model normalize (scanning ${pendingBefore} model/tool rows)${dryRun ? ' [DRY RUN]' : ''} ---`
  )

  let lastId = ''

  for (let batch = 0; batch < maxBatches; batch++) {
    const rows = await db
      .select({
        id: usageLog.id,
        category: usageLog.category,
        description: usageLog.description,
        provider: usageLog.provider,
        toolId: usageLog.toolId,
        metadata: usageLog.metadata,
        pricingSnapshot: usageLog.pricingSnapshot,
      })
      .from(usageLog)
      .where(
        and(
          inArray(usageLog.category, ['model', 'tool']),
          lastId ? gt(usageLog.id, lastId) : undefined
        )
      )
      .orderBy(asc(usageLog.id))
      .limit(batchSize)

    if (rows.length === 0) break

    lastId = rows[rows.length - 1]?.id ?? lastId

    const updates = rows
      .map((row) => {
        const normalized = normalizeUsageLogRowForBackfill({
          category: row.category,
          description: row.description,
          provider: row.provider,
          toolId: row.toolId,
          metadata: row.metadata,
          pricingSnapshot: row.pricingSnapshot,
        })
        if (!normalized) return null
        return { id: row.id, ...normalized }
      })
      .filter(
        (
          row
        ): row is {
          id: string
          description: string
          provider: string | null
          toolId: string | null
          pricingSnapshot: Record<string, unknown> | null
        } => Boolean(row)
      )

    if (updates.length > 0) {
      if (dryRun) {
        stats.updated += updates.length
      } else {
        await Promise.all(
          updates.map((row) =>
            db
              .update(usageLog)
              .set({
                description: row.description,
                provider: row.provider,
                toolId: row.toolId,
                ...(row.pricingSnapshot ? { pricingSnapshot: row.pricingSnapshot } : {}),
              })
              .where(eq(usageLog.id, row.id))
          )
        )
        stats.updated += updates.length
      }
    }

    stats.batches += 1
    console.log(
      `  batch ${stats.batches}: scanned ${rows.length}, normalized ${updates.length} (total ${stats.updated})`
    )

    if (rows.length < batchSize) break
  }

  return stats
}

async function printSummary() {
  const summary = queryRows(
    await db.execute<{
      null_workspace: string
      null_occurred: string
      null_actor_usage: string
      null_actor_executions: string
    }>(sql`
      SELECT
        (SELECT count(*)::text FROM usage_log WHERE workspace_id IS NULL AND workflow_id IS NOT NULL) AS null_workspace,
        (SELECT count(*)::text FROM usage_log WHERE occurred_at IS NULL) AS null_occurred,
        (SELECT count(*)::text FROM usage_log WHERE actor_type IS NULL AND execution_id IS NOT NULL) AS null_actor_usage,
        (SELECT count(*)::text FROM workflow_execution_logs WHERE actor_type IS NULL) AS null_actor_executions
    `)
  )

  const row = summary[0]
  console.log('\n=== Remaining gaps ===')
  console.log(`  usage_log workspace_id (has workflow_id): ${row?.null_workspace ?? '0'}`)
  console.log(`  usage_log occurred_at:                  ${row?.null_occurred ?? '0'}`)
  console.log(`  usage_log actor (has execution_id):     ${row?.null_actor_usage ?? '0'}`)
  console.log(`  workflow_execution_logs actor:            ${row?.null_actor_executions ?? '0'}`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  await assertAttributionColumnsExist(options.step)
  console.log(
    `Phase 4 usage attribution backfill — step=${options.step}, batch=${options.batchSize}${options.dryRun ? ', dry-run' : ''}`
  )

  const results: Record<string, StepStats> = {}

  if (shouldRun(options.step, 'workspace')) {
    results.workspace = await backfillWorkspaceId(
      options.batchSize,
      options.maxBatches,
      options.dryRun
    )
  }

  if (shouldRun(options.step, 'occurred')) {
    results.occurred = await backfillOccurredAt(
      options.batchSize,
      options.maxBatches,
      options.dryRun
    )
  }

  if (shouldRun(options.step, 'actor')) {
    results.actor = await backfillActors(options.batchSize, options.maxBatches, options.dryRun)
  }

  if (shouldRun(options.step, 'normalize')) {
    results.normalize = await backfillNormalization(
      options.batchSize,
      options.maxBatches,
      options.dryRun
    )
  }

  console.log('\n=== Step totals ===')
  for (const [name, stat] of Object.entries(results)) {
    console.log(`  ${name}: updated=${stat.updated}, batches=${stat.batches}`)
  }

  if (!options.dryRun) {
    await printSummary()
  }
}

try {
  await main()
} catch (error) {
  console.error('Backfill failed:', getErrorMessage(error))
  process.exit(1)
}

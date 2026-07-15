#!/usr/bin/env bun
/**
 * Backfill usage_log.chat_id (and run_id when missing) for mothership/copilot ledger rows
 * so Settings → Usage "Mothership & copilot" can join billable cost to chats.
 *
 * Strategies (applied in order, high confidence first):
 *   1. event_key `update-cost:{messageId}-billing` → copilot_messages.message_id / copilot_runs.stream_id
 *   2. usage_log.run_id present, chat_id null → copilot_runs.chat_id
 *   3. (optional --fuzzy) unique copilot_runs match in same workspace+user within ±window seconds
 *
 * Local Arena Copilot historical rows (source=copilot, no chat_id) typically need --fuzzy
 * because sourceReference was hashed into event_key and never stored as plaintext.
 *
 * Usage:
 *   bun --env-file=apps/sim/.env run scripts/backfill-mothership-chat-attribution.ts --dry-run
 *   bun --env-file=apps/sim/.env run scripts/backfill-mothership-chat-attribution.ts
 *   bun --env-file=apps/sim/.env run scripts/backfill-mothership-chat-attribution.ts --fuzzy --window-seconds=180
 *   bun --env-file=apps/sim/.env run scripts/backfill-mothership-chat-attribution.ts --workspace-id=ws_xxx
 */

import { db } from '@sim/db'
import { usageLog } from '@sim/db/schema'
import { getErrorMessage } from '@sim/utils/errors'
import { sql } from 'drizzle-orm'
import {
  MOTHERSHIP_CHAT_ATTRIBUTION_SOURCES,
  parseUpdateCostBillingMessageId,
} from '../apps/sim/lib/billing/core/usage-attribution-backfill.ts'

const DEFAULT_BATCH_SIZE = 2000
const DEFAULT_FUZZY_WINDOW_SECONDS = 120

interface Options {
  dryRun: boolean
  fuzzy: boolean
  batchSize: number
  maxBatches: number
  windowSeconds: number
  workspaceId?: string
}

interface StepStats {
  updated: number
  batches: number
  skippedAmbiguous?: number
}

function parseArgs(argv: string[]): Options {
  const dryRun = argv.includes('--dry-run')
  const fuzzy = argv.includes('--fuzzy')
  const batchArg = argv.find((a) => a.startsWith('--batch-size='))
  const maxBatchesArg = argv.find((a) => a.startsWith('--max-batches='))
  const windowArg = argv.find((a) => a.startsWith('--window-seconds='))
  const workspaceArg = argv.find((a) => a.startsWith('--workspace-id='))

  const batchSize = batchArg
    ? Number.parseInt(batchArg.split('=')[1] ?? '', 10)
    : DEFAULT_BATCH_SIZE
  const maxBatches = maxBatchesArg
    ? Number.parseInt(maxBatchesArg.split('=')[1] ?? '', 10)
    : Number.POSITIVE_INFINITY
  const windowSeconds = windowArg
    ? Number.parseInt(windowArg.split('=')[1] ?? '', 10)
    : DEFAULT_FUZZY_WINDOW_SECONDS

  if (!Number.isFinite(batchSize) || batchSize <= 0) {
    throw new Error('--batch-size must be a positive integer')
  }
  if (maxBatchesArg && (!Number.isFinite(maxBatches) || maxBatches <= 0)) {
    throw new Error('--max-batches must be a positive integer')
  }
  if (!Number.isFinite(windowSeconds) || windowSeconds <= 0) {
    throw new Error('--window-seconds must be a positive integer')
  }

  return {
    dryRun,
    fuzzy,
    batchSize,
    maxBatches,
    windowSeconds,
    workspaceId: workspaceArg?.split('=')[1]?.trim() || undefined,
  }
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

function mothershipSourceList() {
  return sql.join(
    MOTHERSHIP_CHAT_ATTRIBUTION_SOURCES.map((source) => sql`${source}`),
    sql`, `
  )
}

async function countPending(workspaceId?: string): Promise<number> {
  const rows = queryRows(
    await db.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count
      FROM usage_log ul
      WHERE ul.chat_id IS NULL
        AND ul.source IN (${mothershipSourceList()})
        ${workspaceId ? sql`AND ul.workspace_id = ${workspaceId}` : sql``}
    `)
  )
  return Number.parseInt(rows[0]?.count ?? '0', 10)
}

/**
 * Strategy 1: update-cost event keys → message/stream id → chat (+ run when available).
 */
async function backfillFromUpdateCostEventKey(
  batchSize: number,
  maxBatches: number,
  dryRun: boolean,
  workspaceId?: string
): Promise<StepStats> {
  const stats: StepStats = { updated: 0, batches: 0 }
  console.log(`\n--- update-cost event_key → chat_id${dryRun ? ' [DRY RUN]' : ''} ---`)

  for (let batch = 0; batch < maxBatches; batch++) {
    const candidates = queryRows(
      await db.execute<{
        id: string
        event_key: string
        chat_id: string
        run_id: string | null
      }>(sql`
        SELECT
          ul.id,
          ul.event_key,
          coalesce(m.chat_id, r.chat_id) AS chat_id,
          coalesce(ul.run_id, r.id) AS run_id
        FROM usage_log ul
        LEFT JOIN LATERAL (
          SELECT cm.chat_id
          FROM copilot_messages cm
          WHERE cm.message_id = substring(ul.event_key from '^update-cost:(.+)-billing$')
          LIMIT 1
        ) m ON true
        LEFT JOIN LATERAL (
          SELECT cr.id, cr.chat_id
          FROM copilot_runs cr
          WHERE cr.stream_id = substring(ul.event_key from '^update-cost:(.+)-billing$')
          LIMIT 1
        ) r ON true
        WHERE ul.chat_id IS NULL
          AND ul.source IN (${mothershipSourceList()})
          AND ul.event_key ~ '^update-cost:.+-billing$'
          AND coalesce(m.chat_id, r.chat_id) IS NOT NULL
          ${workspaceId ? sql`AND ul.workspace_id = ${workspaceId}` : sql``}
        LIMIT ${batchSize}
      `)
    )

    if (candidates.length === 0) break

    const sampleMessageId = parseUpdateCostBillingMessageId(candidates[0]?.event_key)
    if (!sampleMessageId) {
      throw new Error(`Failed to parse update-cost event_key: ${candidates[0]?.event_key}`)
    }

    if (dryRun) {
      stats.updated += candidates.length
      stats.batches += 1
      console.log(`  batch ${stats.batches}: would update ${candidates.length}`)
      break
    }

    await Promise.all(
      candidates.map((row) =>
        db
          .update(usageLog)
          .set({
            chatId: row.chat_id,
            ...(row.run_id ? { runId: row.run_id } : {}),
          })
          .where(sql`${usageLog.id} = ${row.id} AND ${usageLog.chatId} IS NULL`)
      )
    )

    stats.updated += candidates.length
    stats.batches += 1
    console.log(`  batch ${stats.batches}: updated ${candidates.length} (total ${stats.updated})`)
    if (candidates.length < batchSize) break
  }

  return stats
}

/**
 * Strategy 2: run_id present without chat_id.
 */
async function backfillFromRunId(
  batchSize: number,
  maxBatches: number,
  dryRun: boolean,
  workspaceId?: string
): Promise<StepStats> {
  const stats: StepStats = { updated: 0, batches: 0 }
  console.log(`\n--- run_id → chat_id${dryRun ? ' [DRY RUN]' : ''} ---`)

  for (let batch = 0; batch < maxBatches; batch++) {
    if (dryRun) {
      const sample = queryRows(
        await db.execute<{ id: string }>(sql`
          SELECT ul.id
          FROM usage_log ul
          INNER JOIN copilot_runs cr ON cr.id = ul.run_id
          WHERE ul.chat_id IS NULL
            AND ul.run_id IS NOT NULL
            AND ul.source IN (${mothershipSourceList()})
            ${workspaceId ? sql`AND ul.workspace_id = ${workspaceId}` : sql``}
          LIMIT ${batchSize}
        `)
      )
      if (sample.length === 0) break
      stats.updated += sample.length
      stats.batches += 1
      console.log(`  batch ${stats.batches}: would update ${sample.length}`)
      break
    }

    const result = queryRows(
      await db.execute<{ id: string }>(sql`
        WITH picked AS (
          SELECT ul.id, cr.chat_id
          FROM usage_log ul
          INNER JOIN copilot_runs cr ON cr.id = ul.run_id
          WHERE ul.chat_id IS NULL
            AND ul.run_id IS NOT NULL
            AND ul.source IN (${mothershipSourceList()})
            ${workspaceId ? sql`AND ul.workspace_id = ${workspaceId}` : sql``}
          LIMIT ${batchSize}
        )
        UPDATE usage_log ul
        SET chat_id = picked.chat_id
        FROM picked
        WHERE ul.id = picked.id
          AND ul.chat_id IS NULL
        RETURNING ul.id
      `)
    )

    if (result.length === 0) break
    stats.updated += result.length
    stats.batches += 1
    console.log(`  batch ${stats.batches}: updated ${result.length} (total ${stats.updated})`)
    if (result.length < batchSize) break
  }

  return stats
}

/**
 * Strategy 3 (opt-in): unique time-window match to a copilot run.
 * Intended for Arena Copilot rows that never stamped chat_id.
 */
async function backfillFuzzyFromRuns(
  batchSize: number,
  maxBatches: number,
  dryRun: boolean,
  windowSeconds: number,
  workspaceId?: string
): Promise<StepStats> {
  const stats: StepStats = { updated: 0, batches: 0, skippedAmbiguous: 0 }
  console.log(
    `\n--- fuzzy run time-window (±${windowSeconds}s) → chat_id${dryRun ? ' [DRY RUN]' : ''} ---`
  )

  for (let batch = 0; batch < maxBatches; batch++) {
    const ambiguous = queryRows(
      await db.execute<{ count: string }>(sql`
        WITH pending AS (
          SELECT
            ul.id,
            ul.user_id,
            ul.workspace_id,
            coalesce(ul.occurred_at, ul.created_at) AS occurred_at
          FROM usage_log ul
          WHERE ul.chat_id IS NULL
            AND ul.source IN (${mothershipSourceList()})
            AND ul.workspace_id IS NOT NULL
            ${workspaceId ? sql`AND ul.workspace_id = ${workspaceId}` : sql``}
          ORDER BY ul.created_at ASC
          LIMIT ${batchSize}
        ),
        matched AS (
          SELECT p.id, count(*) AS match_count
          FROM pending p
          INNER JOIN copilot_runs cr
            ON cr.user_id = p.user_id
           AND cr.workspace_id = p.workspace_id
           AND cr.started_at BETWEEN p.occurred_at - make_interval(secs => ${windowSeconds})
                                AND p.occurred_at + make_interval(secs => ${windowSeconds})
          GROUP BY p.id
        )
        SELECT count(*)::text AS count
        FROM matched
        WHERE match_count > 1
      `)
    )
    stats.skippedAmbiguous =
      (stats.skippedAmbiguous ?? 0) + Number.parseInt(ambiguous[0]?.count ?? '0', 10)

    const candidates = queryRows(
      await db.execute<{
        id: string
        chat_id: string
        run_id: string
      }>(sql`
        WITH pending AS (
          SELECT
            ul.id,
            ul.user_id,
            ul.workspace_id,
            coalesce(ul.occurred_at, ul.created_at) AS occurred_at
          FROM usage_log ul
          WHERE ul.chat_id IS NULL
            AND ul.source IN (${mothershipSourceList()})
            AND ul.workspace_id IS NOT NULL
            ${workspaceId ? sql`AND ul.workspace_id = ${workspaceId}` : sql``}
          ORDER BY ul.created_at ASC
          LIMIT ${batchSize}
        ),
        matched AS (
          SELECT
            p.id,
            cr.chat_id,
            cr.id AS run_id,
            count(*) OVER (PARTITION BY p.id) AS match_count
          FROM pending p
          INNER JOIN copilot_runs cr
            ON cr.user_id = p.user_id
           AND cr.workspace_id = p.workspace_id
           AND cr.started_at BETWEEN p.occurred_at - make_interval(secs => ${windowSeconds})
                                AND p.occurred_at + make_interval(secs => ${windowSeconds})
        )
        SELECT id, chat_id, run_id
        FROM matched
        WHERE match_count = 1
      `)
    )

    if (candidates.length === 0) {
      stats.batches += 1
      console.log(
        `  batch ${stats.batches}: no unique matches (ambiguous=${ambiguous[0]?.count ?? 0})`
      )
      break
    }

    if (dryRun) {
      stats.updated += candidates.length
      stats.batches += 1
      console.log(
        `  batch ${stats.batches}: would update ${candidates.length} (ambiguous=${ambiguous[0]?.count ?? 0})`
      )
      break
    }

    await Promise.all(
      candidates.map((row) =>
        db
          .update(usageLog)
          .set({
            chatId: row.chat_id,
            runId: row.run_id,
          })
          .where(sql`${usageLog.id} = ${row.id} AND ${usageLog.chatId} IS NULL`)
      )
    )

    stats.updated += candidates.length
    stats.batches += 1
    console.log(
      `  batch ${stats.batches}: updated ${candidates.length} (total ${stats.updated}, ambiguous=${ambiguous[0]?.count ?? 0})`
    )
    if (candidates.length < batchSize) break
  }

  return stats
}

async function printSummary(workspaceId?: string) {
  const missing = await countPending(workspaceId)
  const withChat = queryRows(
    await db.execute<{ count: string }>(sql`
      SELECT count(*)::text AS count
      FROM usage_log
      WHERE chat_id IS NOT NULL
        AND source IN (${mothershipSourceList()})
        ${workspaceId ? sql`AND workspace_id = ${workspaceId}` : sql``}
    `)
  )
  const bySource = queryRows(
    await db.execute<{ source: string; count: string }>(sql`
      SELECT source, count(*)::text AS count
      FROM usage_log
      WHERE chat_id IS NULL
        AND source IN (${mothershipSourceList()})
        ${workspaceId ? sql`AND workspace_id = ${workspaceId}` : sql``}
      GROUP BY source
      ORDER BY source
    `)
  )

  console.log('\n=== Remaining mothership/copilot chat attribution gaps ===')
  console.log(`  with chat_id:    ${withChat[0]?.count ?? '0'}`)
  console.log(`  missing chat_id: ${missing}`)
  for (const row of bySource) {
    console.log(`    ${row.source}: ${row.count}`)
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2))
  const pendingBefore = await countPending(options.workspaceId)

  console.log(
    `Mothership chat attribution backfill — pending=${pendingBefore}, batch=${options.batchSize}${
      options.fuzzy ? `, fuzzy±${options.windowSeconds}s` : ''
    }${options.workspaceId ? `, workspace=${options.workspaceId}` : ''}${
      options.dryRun ? ', dry-run' : ''
    }`
  )

  const results: Record<string, StepStats> = {}

  results.updateCost = await backfillFromUpdateCostEventKey(
    options.batchSize,
    options.maxBatches,
    options.dryRun,
    options.workspaceId
  )

  results.runId = await backfillFromRunId(
    options.batchSize,
    options.maxBatches,
    options.dryRun,
    options.workspaceId
  )

  if (options.fuzzy) {
    results.fuzzy = await backfillFuzzyFromRuns(
      options.batchSize,
      options.maxBatches,
      options.dryRun,
      options.windowSeconds,
      options.workspaceId
    )
  } else {
    console.log('\n--- fuzzy skipped (pass --fuzzy to match Arena Copilot rows by run time) ---')
  }

  console.log('\n=== Step totals ===')
  for (const [name, stat] of Object.entries(results)) {
    console.log(
      `  ${name}: updated=${stat.updated}, batches=${stat.batches}${
        stat.skippedAmbiguous != null ? `, ambiguous=${stat.skippedAmbiguous}` : ''
      }`
    )
  }

  await printSummary(options.workspaceId)
}

try {
  await main()
} catch (error) {
  console.error('Backfill failed:', getErrorMessage(error))
  process.exit(1)
}

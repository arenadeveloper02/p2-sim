/**
 * Phase 0 empirical audit: compare usage_log ledger sums to workflow_execution_logs.cost_total,
 * surface drift and missing-ledger patterns, and sample model/tool attribution rows.
 *
 * Usage: bun run scripts/phase0-arena-cost-audit.ts [--days=30] [--limit=500]
 */
import { db } from '@sim/db'
import { sql } from 'drizzle-orm'

const daysArg = process.argv.find((a) => a.startsWith('--days='))
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const DAYS = daysArg ? Number.parseInt(daysArg.split('=')[1] ?? '30', 10) : 30
const LIMIT = limitArg ? Number.parseInt(limitArg.split('=')[1] ?? '500', 10) : 500

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

interface ReconciliationRow {
  execution_id: string
  cost_total: string | null
  ledger_sum: string
  drift: string
  status: string
  started_at: Date
  trigger: string
  models_used: string[] | null
}

interface SourceBreakdownRow {
  source: string
  row_count: string
  total_cost: string
  zero_cost_rows: string
}

interface ModelDescriptionRow {
  description: string
  category: string
  source: string
  row_count: string
  total_cost: string
  missing_provider: string
  missing_pricing_snapshot: string
}

interface CopilotModelRow {
  model: string
  row_count: string
  total_cost: string
}

async function main() {
  console.log(`\n=== Phase 0 Arena Cost-Path Audit (last ${DAYS} days, limit ${LIMIT}) ===\n`)

  const runCounts = queryRows(
    await db.execute<{ total: string; with_cost: string; oldest: Date | null }>(sql`
    SELECT
      COUNT(*)::text AS total,
      COUNT(*) FILTER (WHERE cost_total::numeric > 0)::text AS with_cost,
      MIN(started_at) AS oldest
    FROM workflow_execution_logs
  `)
  )
  console.log('\n--- workflow_execution_logs inventory ---')
  console.log(
    `Total runs: ${runCounts[0]?.total ?? '0'}, with cost_total>0: ${runCounts[0]?.with_cost ?? '0'}, oldest: ${runCounts[0]?.oldest ?? 'n/a'}`
  )

  const usageCounts = queryRows(
    await db.execute<{ total: string; oldest: Date | null }>(sql`
    SELECT COUNT(*)::text AS total, MIN(created_at) AS oldest FROM usage_log
  `)
  )
  console.log(
    `usage_log rows: ${usageCounts[0]?.total ?? '0'}, oldest: ${usageCounts[0]?.oldest ?? 'n/a'}`
  )

  const reconciliation = queryRows(
    await db.execute<ReconciliationRow>(sql`
    WITH ledger AS (
      SELECT
        execution_id,
        COALESCE(SUM(cost::numeric), 0) AS ledger_sum
      FROM usage_log
      WHERE execution_id IS NOT NULL
        AND source = 'workflow'
      GROUP BY execution_id
    ),
    runs AS (
      SELECT
        wel.execution_id,
        wel.cost_total,
        wel.started_at,
        wel.status,
        wel.trigger,
        wel.models_used
      FROM workflow_execution_logs wel
      WHERE wel.started_at >= NOW() - (${DAYS}::int || ' days')::interval
        AND wel.status IN ('completed', 'failed', 'cancelled')
      ORDER BY wel.started_at DESC
      LIMIT ${LIMIT}
    )
    SELECT
      r.execution_id,
      r.cost_total,
      COALESCE(l.ledger_sum, 0)::text AS ledger_sum,
      (COALESCE(r.cost_total::numeric, 0) - COALESCE(l.ledger_sum, 0))::text AS drift,
      r.status,
      r.started_at,
      r.trigger,
      r.models_used
    FROM runs r
    LEFT JOIN ledger l ON l.execution_id = r.execution_id
    ORDER BY ABS(COALESCE(r.cost_total::numeric, 0) - COALESCE(l.ledger_sum, 0)) DESC
  `)
  )

  const rows = reconciliation
  const withCost = rows.filter((r) => Number.parseFloat(r.cost_total ?? '0') > 0)
  const drifted = rows.filter((r) => Math.abs(Number.parseFloat(r.drift)) > 1e-6)
  const costNoLedger = rows.filter(
    (r) => Number.parseFloat(r.cost_total ?? '0') > 0 && Number.parseFloat(r.ledger_sum) === 0
  )
  const ledgerNoCostTotal = rows.filter(
    (r) => Number.parseFloat(r.ledger_sum) > 0 && Number.parseFloat(r.cost_total ?? '0') === 0
  )

  console.log('--- Workflow reconciliation (sampled completed runs) ---')
  console.log(`Sampled runs:              ${rows.length}`)
  console.log(`Runs with cost_total > 0:  ${withCost.length}`)
  console.log(`Drift |cost_total - ledger|: ${drifted.length}`)
  console.log(`cost_total > 0, no ledger: ${costNoLedger.length}`)
  console.log(`ledger > 0, cost_total=0:  ${ledgerNoCostTotal.length}`)

  if (drifted.length > 0) {
    console.log('\nTop drift cases:')
    for (const r of drifted.slice(0, 10)) {
      console.log(
        `  ${r.execution_id.slice(0, 8)}… drift=${r.drift} cost_total=${r.cost_total} ledger=${r.ledger_sum} trigger=${r.trigger} models=${(r.models_used ?? []).join(',')}`
      )
    }
  }

  const sourceBreakdown = queryRows(
    await db.execute<SourceBreakdownRow>(sql`
    SELECT
      source,
      COUNT(*)::text AS row_count,
      COALESCE(SUM(cost::numeric), 0)::text AS total_cost,
      COUNT(*) FILTER (WHERE cost::numeric = 0)::text AS zero_cost_rows
    FROM usage_log
    WHERE created_at >= NOW() - (${DAYS}::int || ' days')::interval
    GROUP BY source
    ORDER BY SUM(cost::numeric) DESC
  `)
  )

  console.log('\n--- usage_log by source (all rows) ---')
  for (const r of sourceBreakdown) {
    console.log(
      `  ${r.source.padEnd(18)} rows=${r.row_count.padStart(6)} cost=$${Number.parseFloat(r.total_cost).toFixed(4)} zero_cost_rows=${r.zero_cost_rows}`
    )
  }

  const modelDescriptions = queryRows(
    await db.execute<ModelDescriptionRow>(sql`
    SELECT
      description,
      category,
      source,
      COUNT(*)::text AS row_count,
      COALESCE(SUM(cost::numeric), 0)::text AS total_cost,
      COUNT(*) FILTER (WHERE provider IS NULL)::text AS missing_provider,
      COUNT(*) FILTER (WHERE pricing_snapshot IS NULL)::text AS missing_pricing_snapshot
    FROM usage_log
    WHERE created_at >= NOW() - (${DAYS}::int || ' days')::interval
      AND category IN ('model', 'tool', 'external')
    GROUP BY description, category, source
    ORDER BY SUM(cost::numeric) DESC
    LIMIT 40
  `)
  )

  console.log('\n--- Top model/tool/external ledger descriptions ---')
  for (const r of modelDescriptions) {
    console.log(
      `  [${r.source}/${r.category}] ${r.description}: $${Number.parseFloat(r.total_cost).toFixed(4)} (${r.row_count} rows, missing_provider=${r.missing_provider}, missing_pricing_snapshot=${r.missing_pricing_snapshot})`
    )
  }

  const copilotModels = queryRows(
    await db.execute<CopilotModelRow>(sql`
    SELECT
      description AS model,
      COUNT(*)::text AS row_count,
      COALESCE(SUM(cost::numeric), 0)::text AS total_cost
    FROM usage_log
    WHERE created_at >= NOW() - (${DAYS}::int || ' days')::interval
      AND source IN ('copilot', 'workspace-chat', 'mothership_block', 'mcp_copilot')
      AND category = 'model'
    GROUP BY description
    ORDER BY SUM(cost::numeric) DESC
    LIMIT 30
  `)
  )

  console.log('\n--- Copilot/mothership model descriptions in ledger ---')
  for (const r of copilotModels) {
    console.log(
      `  ${r.model}: $${Number.parseFloat(r.total_cost).toFixed(4)} (${r.row_count} rows)`
    )
  }

  const nullWorkspace = queryRows(
    await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count
    FROM usage_log
    WHERE workspace_id IS NULL
      AND created_at >= NOW() - (${DAYS}::int || ' days')::interval
  `)
  )

  console.log(`\n--- Data health ---`)
  console.log(`usage_log rows with NULL workspace_id (last ${DAYS}d): ${nullWorkspace[0]?.count ?? '0'}`)

  const executionFeeRows = queryRows(
    await db.execute<{ count: string; total: string }>(sql`
    SELECT COUNT(*)::text AS count, COALESCE(SUM(cost::numeric), 0)::text AS total
    FROM usage_log
    WHERE category = 'fixed' AND description = 'execution_fee'
      AND created_at >= NOW() - (${DAYS}::int || ' days')::interval
  `)
  )
  console.log(
    `execution_fee rows: ${executionFeeRows[0]?.count ?? '0'}, total=$${Number.parseFloat(executionFeeRows[0]?.total ?? '0').toFixed(4)}`
  )

  const externalRows = queryRows(
    await db.execute<{
    count: string
    total: string
    with_vendor: string
  }>(sql`
    SELECT
      COUNT(*)::text AS count,
      COALESCE(SUM(cost::numeric), 0)::text AS total,
      COUNT(*) FILTER (WHERE vendor IS NOT NULL)::text AS with_vendor
    FROM usage_log
    WHERE category = 'external'
      AND created_at >= NOW() - (${DAYS}::int || ' days')::interval
  `)
  )
  console.log(
    `external category rows: ${externalRows[0]?.count ?? '0'}, total=$${Number.parseFloat(externalRows[0]?.total ?? '0').toFixed(4)}, with_vendor=${externalRows[0]?.with_vendor ?? '0'}`
  )

  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

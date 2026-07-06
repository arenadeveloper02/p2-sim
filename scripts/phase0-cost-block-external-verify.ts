/**
 * Phase 0: instrumented Cost-block path — confirms `category='external'` rows
 * insert correctly after migration 0249_usage_log_category_external.sql.
 *
 * Chains: CostBlockHandler → trace span → calculateCostSummary → recordUsage → DB readback.
 *
 * Usage: bun --env-file=apps/sim/.env run scripts/phase0-cost-block-external-verify.ts
 */
import { db } from '@sim/db'
import { usageLog, user } from '@sim/db/schema'
import { generateId } from '@sim/utils/id'
import { eq, sql } from 'drizzle-orm'
import { BlockType } from '../apps/sim/executor/constants'
import { CostBlockHandler } from '../apps/sim/executor/handlers/cost/cost-handler'
import type { ExecutionContext } from '../apps/sim/executor/types'
import type { SerializedBlock } from '../apps/sim/serializer/types'
import { recordUsage, scaleUsageLogCost } from '../apps/sim/lib/billing/core/usage-log'
import { calculateCostSummary } from '../apps/sim/lib/logs/execution/logging-factory'

const PHASE0_EXECUTION_ID = `phase0-cost-external-${generateId()}`
const PHASE0_VENDOR = 'Phase0 Partner API'

async function assertExternalEnum(): Promise<void> {
  const result = await db.execute<{ exists: boolean }>(sql`
    SELECT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'usage_log_category'
        AND e.enumlabel = 'external'
    ) AS "exists"
  `)
  const exists = result[0]?.exists
  if (!exists) {
    throw new Error(
      "usage_log_category enum lacks 'external'. Apply migration 0249_usage_log_category_external.sql first."
    )
  }
  console.log('✓ migration 0249: usage_log_category includes external')
}

async function resolveBillingUserId(): Promise<string> {
  const [row] = await db.select({ id: user.id }).from(user).limit(1)
  if (!row?.id) {
    throw new Error('No user row in database — cannot insert usage_log (user_id FK). Seed a user first.')
  }
  return row.id
}

function buildCostBlockContext(): { handler: CostBlockHandler; ctx: ExecutionContext; block: SerializedBlock } {
  const handler = new CostBlockHandler()
  const block: SerializedBlock = {
    id: 'phase0-cost-block',
    metadata: { id: BlockType.COST, name: 'Phase0 Cost' },
    position: { x: 0, y: 0 },
    config: { tool: BlockType.COST, params: {} },
    inputs: {},
    outputs: {},
    enabled: true,
  }
  const ctx: ExecutionContext = {
    workflowId: 'phase0-workflow',
    blockStates: new Map(),
    blockLogs: [],
    metadata: { duration: 0 },
    environmentVariables: {},
    decisions: { router: new Map(), condition: new Map() },
    loopExecutions: new Map(),
    completedLoops: new Set(),
    executedBlocks: new Set(),
    activeExecutionPath: new Set(),
    workflow: { blocks: [], connections: [] },
  }
  return { handler, ctx, block }
}

async function main() {
  console.log('\n=== Phase 0 Cost Block → external ledger verification ===\n')

  await assertExternalEnum()
  const userId = await resolveBillingUserId()
  console.log(`✓ billing user: ${userId.slice(0, 8)}…`)

  const { handler, ctx, block } = buildCostBlockContext()
  const blockOutput = await handler.execute(ctx, block, {
    mode: 'fixed',
    amount: '0.42',
    currency: 'USD',
    vendor: PHASE0_VENDOR,
    label: 'Phase0 instrumented run',
  })

  if (!blockOutput.recorded || blockOutput.cost?.total !== 0.42) {
    throw new Error(`CostBlockHandler did not record expected $0.42: ${JSON.stringify(blockOutput)}`)
  }
  console.log('✓ CostBlockHandler recorded $0.42 USD')

  const traceSpans = [
    {
      id: block.id,
      name: 'Phase0 Cost',
      type: 'cost' as const,
      cost: blockOutput.cost,
      output: blockOutput,
    },
  ]

  const costSummary = calculateCostSummary(traceSpans)
  const externalKey = Object.keys(costSummary.external)[0]
  const externalCharge = costSummary.external[externalKey]
  if (!externalCharge || externalCharge.total !== 0.42) {
    throw new Error(`calculateCostSummary external map unexpected: ${JSON.stringify(costSummary.external)}`)
  }
  console.log(`✓ calculateCostSummary external["${externalKey}"] = $${externalCharge.total}`)

  const eventKey = `phase0-external-verify:${PHASE0_EXECUTION_ID}`
  const scaledCost = scaleUsageLogCost(0.42)
  const multiplierNote =
    scaledCost !== 0.42
      ? `WARNING: USAGE_LOG_COST_MULTIPLIER applied to external ($0.42 → $${scaledCost}); Phase 2 should exempt category=external`
      : 'multiplier=1 (external amount unchanged)'

  await recordUsage({
    userId,
    executionId: PHASE0_EXECUTION_ID,
    entries: [
      {
        category: 'external',
        source: 'workflow',
        description: externalKey,
        cost: 0.42,
        eventKey,
        vendor: externalCharge.vendor,
        quantity: externalCharge.quantity,
        unit: externalCharge.unit,
        metadata: externalCharge.metadata ?? null,
      },
    ],
  })
  console.log(`✓ recordUsage inserted category=external row (${multiplierNote})`)

  const [row] = await db
    .select({
      category: usageLog.category,
      description: usageLog.description,
      cost: usageLog.cost,
      rawCost: usageLog.rawCost,
      billableCost: usageLog.billableCost,
      vendor: usageLog.vendor,
      quantity: usageLog.quantity,
      unit: usageLog.unit,
      metadata: usageLog.metadata,
      executionId: usageLog.executionId,
      source: usageLog.source,
    })
    .from(usageLog)
    .where(eq(usageLog.eventKey, eventKey))
    .limit(1)

  if (!row) {
    throw new Error('Inserted usage_log row not found by eventKey')
  }

  const checks: Array<[string, boolean]> = [
    ['category=external', row.category === 'external'],
    ['source=workflow', row.source === 'workflow'],
    ['cost=0.42 (or scaled)', Number.parseFloat(row.cost) > 0],
    ['vendor set', row.vendor === PHASE0_VENDOR],
    ['execution_id set', row.executionId === PHASE0_EXECUTION_ID],
    ['metadata.originalAmount', (row.metadata as { originalAmount?: number })?.originalAmount === 0.42],
    ['metadata.originalCurrency=USD', (row.metadata as { originalCurrency?: string })?.originalCurrency === 'USD'],
  ]

  console.log('\n--- usage_log readback ---')
  for (const [label, ok] of checks) {
    console.log(`${ok ? '✓' : '✗'} ${label}`)
    if (!ok) {
      console.error('Row:', row)
      throw new Error(`Verification failed: ${label}`)
    }
  }

  console.log('\nRow snapshot:', {
    category: row.category,
    description: row.description,
    cost: row.cost,
    vendor: row.vendor,
    quantity: row.quantity,
    unit: row.unit,
    metadata: row.metadata,
  })

  await db.delete(usageLog).where(eq(usageLog.eventKey, eventKey))
  console.log('\n✓ cleaned up phase0 test row')
  console.log('\nPhase 0 Cost-block external verification: PASSED\n')
  process.exit(0)
}

main().catch((err) => {
  console.error('\nPhase 0 Cost-block external verification: FAILED\n', err)
  process.exit(1)
})

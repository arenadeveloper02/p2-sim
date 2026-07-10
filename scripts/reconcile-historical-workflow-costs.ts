#!/usr/bin/env bun
/**
 * Historical workflow cost reconciliation CLI.
 *
 * Modes:
 *   --audit     Classify executions by reconciliation evidence and risk (no writes)
 *   --dry-run   Compute target ledger deltas (future)
 *   --apply     Apply adjustments from a dry-run artifact (future)
 *
 * Usage:
 *   bun --env-file=apps/sim/.env run scripts/reconcile-historical-workflow-costs.ts --audit --since=2020-01-01 --batch-size=1000
 *   bun --env-file=apps/sim/.env run scripts/reconcile-historical-workflow-costs.ts --audit --workflow-id=<id> --limit=100
 */
import {
  auditHistoricalWorkflowExecutions,
  type ReconciliationClass,
  type ReconciliationConfidence,
} from '../apps/sim/lib/billing/core/historical-workflow-reconciliation'

interface Options {
  audit: boolean
  workflowId?: string
  executionId?: string
  workspaceId?: string
  since?: Date
  until?: Date
  limit?: number
  exportPath?: string
}

function parseDateArg(raw: string | undefined): Date | undefined {
  if (!raw) return undefined
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed
}

function parseArgs(argv: string[]): Options {
  const audit = argv.includes('--audit')
  const workflowId = argv.find((arg) => arg.startsWith('--workflow-id='))?.split('=')[1]
  const executionId = argv.find((arg) => arg.startsWith('--execution-id='))?.split('=')[1]
  const workspaceId = argv.find((arg) => arg.startsWith('--workspace-id='))?.split('=')[1]
  const since = parseDateArg(argv.find((arg) => arg.startsWith('--since='))?.split('=')[1])
  const until = parseDateArg(argv.find((arg) => arg.startsWith('--until='))?.split('=')[1])
  const limitRaw = argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1]
  const batchSizeRaw = argv.find((arg) => arg.startsWith('--batch-size='))?.split('=')[1]
  const exportPath = argv.find((arg) => arg.startsWith('--export='))?.split('=')[1]

  const limit = limitRaw
    ? Number.parseInt(limitRaw, 10)
    : batchSizeRaw
      ? Number.parseInt(batchSizeRaw, 10)
      : undefined

  return {
    audit,
    workflowId,
    executionId,
    workspaceId,
    since,
    until,
    limit,
    exportPath,
  }
}

function formatClassCounts(byClass: Record<ReconciliationClass, number>): string {
  return Object.entries(byClass)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `  ${name.padEnd(28)} ${count}`)
    .join('\n')
}

function formatConfidenceCounts(byConfidence: Record<ReconciliationConfidence, number>): string {
  return Object.entries(byConfidence)
    .map(([name, count]) => `  ${name.padEnd(8)} ${count}`)
    .join('\n')
}

function printAuditSummary(options: Options): void {
  const window =
    options.since || options.until
      ? `${options.since?.toISOString() ?? '…'} → ${options.until?.toISOString() ?? '…'}`
      : 'all time'

  console.log(`\n=== Historical Workflow Cost Reconciliation Audit (${window}) ===\n`)
  if (options.workflowId) console.log(`Workflow filter: ${options.workflowId}`)
  if (options.executionId) console.log(`Execution filter: ${options.executionId}`)
  if (options.workspaceId) console.log(`Workspace filter: ${options.workspaceId}`)
  if (options.limit) console.log(`Limit: ${options.limit}`)
}

async function main() {
  const options = parseArgs(process.argv.slice(2))

  if (!options.audit) {
    console.error('No mode selected. Supported: --audit')
    process.exit(1)
  }

  printAuditSummary(options)

  const summary = await auditHistoricalWorkflowExecutions({
    workflowId: options.workflowId,
    executionId: options.executionId,
    workspaceId: options.workspaceId,
    since: options.since,
    until: options.until,
    limit: options.limit,
  })

  console.log('--- Reconciliation class counts ---')
  console.log(formatClassCounts(summary.byClass))

  console.log('\n--- Confidence ---')
  console.log(formatConfidenceCounts(summary.byConfidence))

  console.log('\n--- Summary ---')
  console.log(`Classified executions: ${summary.total}`)
  console.log(`With projection drift: ${summary.withDrift}`)
  console.log(`Apply-eligible (v1):   ${summary.applyEligible}`)

  if (summary.topRiskExamples.length > 0) {
    console.log('\n--- Top risk examples ---')
    for (const item of summary.topRiskExamples) {
      const secondary =
        item.secondaryClasses.length > 0 ? ` secondary=${item.secondaryClasses.join(',')}` : ''
      const warningText = item.warnings.length > 0 ? ` warnings=${item.warnings.join(';')}` : ''
      const blockerText = item.blockers.length > 0 ? ` blockers=${item.blockers.join(';')}` : ''
      console.log(
        `  ${item.executionId.slice(0, 8)}… class=${item.primaryClass} confidence=${item.confidence} drift=${item.drift.toFixed(6)} ledger=${item.ledgerSum.toFixed(6)} cost_total=${item.costTotal?.toFixed(6) ?? 'null'} apply=${item.applyEligible}${secondary}${warningText}${blockerText}`
      )
    }
  }

  if (options.exportPath) {
    const payload = {
      generatedAt: new Date().toISOString(),
      filters: {
        workflowId: options.workflowId ?? null,
        executionId: options.executionId ?? null,
        workspaceId: options.workspaceId ?? null,
        since: options.since?.toISOString() ?? null,
        until: options.until?.toISOString() ?? null,
        limit: options.limit ?? null,
      },
      summary: {
        total: summary.total,
        byClass: summary.byClass,
        byConfidence: summary.byConfidence,
        applyEligible: summary.applyEligible,
        withDrift: summary.withDrift,
      },
      classifications: summary.classifications,
    }

    await Bun.write(options.exportPath, `${JSON.stringify(payload, null, 2)}\n`)
    console.log(`\nExported classification artifact: ${options.exportPath}`)
  }

  process.exit(0)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

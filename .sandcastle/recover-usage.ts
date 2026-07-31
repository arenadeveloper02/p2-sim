/**
 * Post-job publisher for cancelled / failed / completed Actions runs.
 *
 * Rebuilds agent usage from logs or ledger, then writes a detailed markdown
 * report to `$GITHUB_STEP_SUMMARY` (status, sync context, conflicts,
 * verification, usage).
 *
 * Usage:
 *   bun .sandcastle/recover-usage.ts [runId]
 *   bun .sandcastle/recover-usage.ts --commit [runId]
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import {
  appendRunLogSections,
  readState,
  runGit,
  todayRunId,
} from './lib/config'
import {
  inferOutcomeFromEnvironment,
  publishRunJobSummary,
  readRunOutcome,
} from './lib/job-summary'
import {
  formatUsageMarkdown,
  getUsageRecords,
  loadUsageRecordsFromJson,
  recoverUsageFromLogDir,
  resetUsageRecords,
  writeUsageJson,
} from './lib/usage'

function hasStagedChanges(): boolean {
  try {
    runGit(['diff', '--cached', '--quiet'])
    return false
  } catch {
    return true
  }
}

function parseArgs(argv: string[]): { commit: boolean; runId: string | null } {
  let commit = false
  let runId: string | null = null
  for (const arg of argv) {
    if (arg === '--commit') {
      commit = true
      continue
    }
    if (arg.startsWith('-')) continue
    runId = arg
  }
  return { commit, runId }
}

function resolveRunId(explicit: string | null): string {
  if (explicit?.trim()) return explicit.trim()
  try {
    const fromState = readState().lastRunId
    if (fromState) return fromState
  } catch {
    // state may be missing on a fresh checkout
  }
  return todayRunId()
}

function actionsRunUrl(): string | null {
  const server = process.env.GITHUB_SERVER_URL
  const repo = process.env.GITHUB_REPOSITORY
  const runId = process.env.GITHUB_RUN_ID
  if (!server || !repo || !runId) return null
  return `${server}/${repo}/actions/runs/${runId}`
}

const { commit, runId: argRunId } = parseArgs(process.argv.slice(2))
const runId = resolveRunId(argRunId)
const logDir = join(process.cwd(), '.sandcastle', 'logs')
const jobStatus = process.env.UPSTREAM_SYNC_JOB_STATUS ?? process.env.JOB_STATUS ?? null

resetUsageRecords()

if (existsSync(logDir)) {
  recoverUsageFromLogDir(logDir)
}

if (getUsageRecords().length === 0) {
  loadUsageRecordsFromJson(runId)
}

const records = getUsageRecords()

if (records.length > 0) {
  writeUsageJson(runId, records)
  const markdown = formatUsageMarkdown(records)
  appendRunLogSections(runId, { Usage: markdown })
  console.log(
    `[recover-usage] wrote usage for ${records.length} agent(s) under ledger/${runId}/`
  )
} else {
  console.log('[recover-usage] no agent usage found in logs or ledger')
}

const outcome = readRunOutcome(runId) ?? inferOutcomeFromEnvironment(runId, jobStatus)

publishRunJobSummary({
  outcome,
  jobStatus,
  usageRecords: records,
  repository: process.env.GITHUB_REPOSITORY ?? null,
  serverUrl: process.env.GITHUB_SERVER_URL ?? null,
  runUrl: actionsRunUrl(),
})

if (commit && records.length > 0) {
  try {
    runGit(['add', '.upstream-sync'])
    if (hasStagedChanges()) {
      runGit(['commit', '-m', `upstream-sync(${runId}): recover agent usage after cancel/error`])
      console.log('[recover-usage] committed ledger usage files')
    } else {
      console.log('[recover-usage] no ledger changes to commit')
    }
  } catch (error) {
    console.warn('[recover-usage] commit skipped (likely mid-merge conflicts):', error)
  }
}

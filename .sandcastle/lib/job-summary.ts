/**
 * GitHub Actions job summary for upstream-sync runs.
 *
 * Writes a structured `outcome.json` during the harness, then the always()
 * CI step publishes a detailed Summary tab (status, sync context, conflicts,
 * verification, agent usage) for completed, failed, and cancelled runs.
 */
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { ensureLedgerRunDir, ledgerRunDir, listConflictFiles, readState } from './config'
import { type AgentUsageRecord, formatUsageStepSummary, getUsageRecords } from './usage'
import type { VerifyResult } from './verify'

export type RunOutcomeKind =
  | 'completed'
  | 'awaiting_input'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'noop'

export interface RunOutcomeVerification {
  command: string
  success: boolean
  /** Truncated failure output for the summary. */
  detail?: string
}

export interface RunOutcome {
  runId: string
  kind: RunOutcomeKind
  title: string
  detail?: string
  syncBranch?: string | null
  mergeBase?: string | null
  upstreamSha?: string | null
  prNumber?: number | null
  commitCount?: number
  remainingConflicts?: string[]
  verification?: RunOutcomeVerification[]
  errorMessage?: string
  recordedAt: string
}

export interface JobSummaryContext {
  outcome: RunOutcome | null
  /** Actions `job.status`: success | failure | cancelled | skipped */
  jobStatus?: string | null
  usageRecords?: readonly AgentUsageRecord[]
  repository?: string | null
  serverUrl?: string | null
  runUrl?: string | null
}

function truncate(text: string, max = 1200): string {
  const trimmed = text.trim()
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max)}\n…(truncated)`
}

export function writeRunOutcome(
  runId: string,
  outcome: Omit<RunOutcome, 'runId' | 'recordedAt'>
): string {
  const full: RunOutcome = {
    ...outcome,
    runId,
    recordedAt: new Date().toISOString(),
  }
  const path = join(ensureLedgerRunDir(runId), 'outcome.json')
  writeFileSync(path, `${JSON.stringify(full, null, 2)}\n`)
  return path
}

export function readRunOutcome(runId: string): RunOutcome | null {
  const path = join(ledgerRunDir(runId), 'outcome.json')
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as RunOutcome
    if (!parsed || typeof parsed !== 'object' || typeof parsed.kind !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function verificationToOutcome(results: VerifyResult[]): RunOutcomeVerification[] {
  return results.map((r) => ({
    command: r.command,
    success: r.success,
    detail: r.success ? undefined : truncate(r.output),
  }))
}

function outcomeBadge(kind: RunOutcomeKind, jobStatus?: string | null): string {
  if (jobStatus === 'cancelled' || kind === 'cancelled') return '❌ Cancelled'
  switch (kind) {
    case 'completed':
      return '✅ Completed'
    case 'awaiting_input':
      return '⏸️ Awaiting input'
    case 'blocked':
      return '🚫 Blocked'
    case 'failed':
      return '❌ Failed'
    case 'noop':
      return '➖ No changes'
    default:
      return `• ${kind}`
  }
}

function resolveEffectiveKind(
  outcome: RunOutcome | null,
  jobStatus?: string | null
): RunOutcomeKind {
  if (jobStatus === 'cancelled') return 'cancelled'
  if (outcome?.kind) return outcome.kind
  if (jobStatus === 'failure') return 'failed'
  if (jobStatus === 'success') return 'completed'
  return 'failed'
}

function prUrl(
  repository: string | null | undefined,
  prNumber: number | null | undefined
): string | null {
  if (!repository || !prNumber || prNumber <= 0) return null
  return `https://github.com/${repository}/pull/${prNumber}`
}

function shaLink(sha: string | null | undefined): string {
  if (!sha) return '_unknown_'
  return `[\`${sha.slice(0, 8)}\`](https://github.com/simstudioai/sim/commit/${sha})`
}

/**
 * Build the full markdown body for the Actions job Summary tab.
 */
export function formatRunJobSummary(ctx: JobSummaryContext): string {
  const outcome = ctx.outcome
  const kind = resolveEffectiveKind(outcome, ctx.jobStatus)
  const state = (() => {
    try {
      return readState()
    } catch {
      return null
    }
  })()

  const syncBranch = outcome?.syncBranch ?? state?.activeBranch ?? null
  const mergeBase = outcome?.mergeBase ?? state?.activeMergeBase ?? null
  const prNumber = outcome?.prNumber ?? state?.activePrNumber ?? null
  const upstreamSha = outcome?.upstreamSha ?? state?.lastSyncedUpstreamSha ?? null
  const runId = outcome?.runId ?? state?.lastRunId ?? '_unknown_'
  const conflicts =
    outcome?.remainingConflicts ??
    (kind === 'awaiting_input' || kind === 'cancelled' || kind === 'failed'
      ? (() => {
          try {
            return listConflictFiles()
          } catch {
            return []
          }
        })()
      : [])

  const lines: string[] = [
    `## Upstream sync — ${outcomeBadge(kind, ctx.jobStatus)}`,
    '',
    outcome?.title ? `**${outcome.title}**` : '',
    outcome?.detail ? '' : '',
    outcome?.detail ? outcome.detail : '',
    '',
    '### Run details',
    '',
    `| | |`,
    `| --- | --- |`,
    `| **Result** | ${outcomeBadge(kind, ctx.jobStatus)} |`,
    `| **Run ID** | \`${runId}\` |`,
    `| **Sync branch** | ${syncBranch ? `\`${syncBranch}\`` : '_none_'} |`,
    `| **Merge base (target)** | ${mergeBase ? `\`${mergeBase}\`` : '_unknown_'} |`,
    `| **Upstream HEAD** | ${shaLink(upstreamSha)} |`,
  ]

  if (typeof outcome?.commitCount === 'number') {
    lines.push(`| **Upstream commits** | ${outcome.commitCount} |`)
  }

  const pull = prUrl(ctx.repository, prNumber)
  lines.push(
    `| **Draft PR** | ${pull ? `[#${prNumber}](${pull})` : prNumber ? `#${prNumber}` : '_none_'} |`
  )

  if (ctx.runUrl) {
    lines.push(`| **Actions run** | [open](${ctx.runUrl}) |`)
  }

  if (ctx.jobStatus) {
    lines.push(`| **Job status** | \`${ctx.jobStatus}\` |`)
  }

  if (outcome?.errorMessage) {
    lines.push('', '### Error', '', '```', truncate(outcome.errorMessage, 2000), '```')
  }

  if (conflicts.length > 0) {
    lines.push(
      '',
      `### Remaining conflicts (${conflicts.length})`,
      '',
      ...conflicts.slice(0, 40).map((f) => `- \`${f}\``)
    )
    if (conflicts.length > 40) {
      lines.push(`- _…and ${conflicts.length - 40} more_`)
    }
  }

  const verification = outcome?.verification
  if (verification && verification.length > 0) {
    lines.push('', '### Verification', '')
    for (const step of verification) {
      lines.push(`- ${step.success ? '✅' : '❌'} \`${step.command}\``)
      if (!step.success && step.detail) {
        lines.push('', '```', step.detail, '```', '')
      }
    }
  } else if (kind === 'completed') {
    lines.push(
      '',
      '### Verification',
      '',
      '✅ `bun run check` · `bun run lint` · `bun run test` (full `bun run build` left to CI)'
    )
  }

  const usage = ctx.usageRecords ?? getUsageRecords()
  lines.push('', formatUsageStepSummary(usage))

  lines.push(
    '',
    '### Ledger',
    '',
    `- \`.upstream-sync/ledger/${runId}/run.md\``,
    `- \`.upstream-sync/ledger/${runId}/usage.json\``,
    `- \`.upstream-sync/ledger/${runId}/outcome.json\``,
    `- \`.upstream-sync/state.json\``
  )

  if (kind === 'awaiting_input') {
    lines.push(
      '',
      '### Next step',
      '',
      'Reply `/upstream-sync resume` on the draft PR (or re-run the workflow with `resume=true`).'
    )
  }

  return lines
    .filter((line, idx, arr) => {
      // Drop accidental double blank lines from optional fields
      if (line !== '') return true
      return idx === 0 || arr[idx - 1] !== ''
    })
    .join('\n')
}

/** Append the full run summary to `$GITHUB_STEP_SUMMARY`. */
export function publishRunJobSummary(ctx: JobSummaryContext): boolean {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY
  if (!summaryPath) {
    console.log('[job-summary] GITHUB_STEP_SUMMARY unset — skipping')
    return false
  }
  const markdown = formatRunJobSummary(ctx)
  appendFileSync(summaryPath, `\n${markdown}\n`)
  console.log(`[job-summary] published ${resolveEffectiveKind(ctx.outcome, ctx.jobStatus)} summary`)
  return true
}

/**
 * Infer a cancelled/failed outcome when the harness never wrote outcome.json
 * (SIGKILL before flush, early crash, etc.).
 */
export function inferOutcomeFromEnvironment(runId: string, jobStatus?: string | null): RunOutcome {
  const state = readState()
  const kind: RunOutcomeKind =
    jobStatus === 'cancelled' ? 'cancelled' : jobStatus === 'success' ? 'completed' : 'failed'

  let remainingConflicts: string[] = []
  try {
    remainingConflicts = listConflictFiles()
  } catch {
    remainingConflicts = []
  }

  const titles: Record<RunOutcomeKind, string> = {
    cancelled: 'Workflow cancelled before the harness finished',
    failed: 'Harness ended without a recorded outcome',
    completed: 'Run finished (outcome file missing)',
    awaiting_input: 'Awaiting input',
    noop: 'No upstream changes',
  }

  return {
    runId,
    kind,
    title: titles[kind],
    detail:
      kind === 'cancelled'
        ? 'Usage and conflicts below are recovered from local logs / workspace state after cancel.'
        : 'The harness did not write `outcome.json`; summary is reconstructed from state and logs.',
    syncBranch: state.activeBranch,
    mergeBase: state.activeMergeBase,
    upstreamSha: state.lastSyncedUpstreamSha,
    prNumber: state.activePrNumber,
    remainingConflicts: remainingConflicts.length > 0 ? remainingConflicts : undefined,
    recordedAt: new Date().toISOString(),
  }
}

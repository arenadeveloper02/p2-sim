/**
 * Upstream sync harness — merges simstudioai/sim main into the current branch.
 *
 * Phased pipeline:
 * 1. Detect upstream changes
 * 2. Parent agent: grill-me analysis + FBI report
 * 3. Git merge upstream/main
 * 4. Child agents per conflict cluster
 * 5. Verification (check, lint, test, build)
 * 6. Draft PR + ledger commit
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createSandbox } from '@ai-hero/sandcastle'
import { noSandbox } from '@ai-hero/sandcastle/sandboxes/no-sandbox'
import { resolveAgents } from './lib/agents'
import {
  COMPLETION_SIGNAL,
  MERGE_POLICY_PATH,
  QUESTION_MARKER,
  RESUME_COMMAND,
  appendExtensibilityNote,
  baseBranch,
  closeSupersededPr,
  commitsSince,
  detectReleaseVersions,
  ensureUpstreamSyncScaffold,
  fetchAllUpstreamReleaseNotes,
  fetchUpstream,
  formatReleaseNotesMarkdown,
  getPrReviewers,
  groupConflictClusters,
  listConflictFiles,
  logHarnessQuestion,
  readState,
  runGit,
  runGh,
  substitutePrompt,
  syncGrillQaFromPr,
  todayRunId,
  upstreamBranch,
  upstreamHeadSha,
  upstreamRemote,
  writeClusterManifest,
  writeFbiReport,
  writeReleaseNotesReport,
  writeRunLog,
  writeSkippedReport,
  writeState,
} from './lib/config'
import { allVerificationPassed, formatVerifyResults, runVerification } from './lib/verify'

const PROMPTS_DIR = join(import.meta.dir, 'prompts')
const SKIP_AGENT = process.env.UPSTREAM_SYNC_SKIP_AGENT === 'true'
const FORCE_RUN = process.env.UPSTREAM_SYNC_FORCE === 'true'
const RESUME = process.env.UPSTREAM_SYNC_RESUME === 'true'

function hasStagedChanges(): boolean {
  try {
    runGit(['diff', '--cached', '--quiet'])
    return false
  } catch {
    return true
  }
}

function readPrompt(name: string): string {
  return readFileSync(join(PROMPTS_DIR, name), 'utf8')
}

function syncBranchName(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `upstream-sync/${stamp}`
}

function checkoutSyncBranch(syncBranch: string, resume: boolean): void {
  if (resume) {
    runGit(['fetch', 'origin', syncBranch])
    runGit(['checkout', syncBranch])
    return
  }

  runGit(['checkout', '-B', syncBranch])
}

async function runAgentPrompt(options: {
  prompt: string
  name: string
  branch: string
  agent: ReturnType<typeof resolveAgents>['parent']
  maxIterations?: number
}): Promise<void> {
  if (SKIP_AGENT) {
    console.log(`[skip-agent] ${options.name}`)
    return
  }

  await using sandbox = await createSandbox({
    branch: options.branch,
    sandbox: noSandbox(),
    hooks: {
      sandbox: {
        onSandboxReady: [{ command: 'bun install --frozen-lockfile' }],
      },
    },
  })

  await sandbox.run({
    agent: options.agent,
    prompt: options.prompt,
    name: options.name,
    maxIterations: options.maxIterations ?? 3,
    completionSignal: COMPLETION_SIGNAL,
    branchStrategy: { type: 'branch', branch: options.branch },
    logging: {
      type: 'file',
      path: join('.sandcastle', 'logs', `${options.name}.log`),
    },
  })
}

function createDraftPr(mergeBase: string, branch: string, runId: string, body: string): number {
  const title = `upstream-sync: merge simstudioai/sim main into ${mergeBase} (${runId})`
  runGit(['push', '-u', 'origin', branch])

  const prUrl = runGh([
    'pr',
    'create',
    '--base',
    mergeBase,
    '--head',
    branch,
    '--title',
    title,
    '--body',
    body,
    '--draft',
  ])

  const match = prUrl.match(/\/pull\/(\d+)/)
  const prNumber = match ? Number(match[1]) : 0

  const reviewers = getPrReviewers()
  if (prNumber > 0 && reviewers.length > 0) {
    try {
      runGh(['pr', 'edit', String(prNumber), '--add-reviewer', reviewers.join(',')])
    } catch (error) {
      console.warn(`Could not add reviewers (${reviewers.join(', ')}):`, error)
    }
  }

  return prNumber
}

function commitUpstreamLedger(message: string): void {
  runGit(['add', '.upstream-sync'])
  if (hasStagedChanges()) {
    runGit(['commit', '-m', message])
  }
}

async function main(): Promise<void> {
  ensureUpstreamSyncScaffold()
  fetchUpstream()

  const state = readState()
  const mergeBase = RESUME && state.activeMergeBase ? state.activeMergeBase : baseBranch()
  console.log(`Sync target: ${mergeBase} ← simstudioai/sim main`)
  const headSha = upstreamHeadSha()
  const runId = todayRunId()
  const upstreamCommits = commitsSince(state.lastSyncedUpstreamSha, headSha)

  if (!FORCE_RUN && !RESUME && state.lastSyncedUpstreamSha === headSha) {
    console.log(`No upstream changes (already at ${headSha.slice(0, 8)}).`)
    return
  }

  if (upstreamCommits.length === 0 && !FORCE_RUN && !RESUME) {
    console.log('No new upstream commits.')
    writeState({ ...state, lastSyncedUpstreamSha: headSha, status: 'idle' })
    return
  }

  if (RESUME && state.activePrNumber) {
    syncGrillQaFromPr(state.activePrNumber, state.lastRunId ?? runId)
  }

  let syncBranch: string
  if (RESUME && state.activeBranch) {
    syncBranch = state.activeBranch
  } else {
    if (state.activePrNumber) {
      closeSupersededPr(state.activePrNumber, {
        newUpstreamSha: headSha,
        runId,
        newBranch: syncBranchName(),
      })
    }
    syncBranch = syncBranchName()
  }

  checkoutSyncBranch(syncBranch, RESUME && Boolean(state.activeBranch))

  if (RESUME && state.activePrNumber) {
    commitUpstreamLedger(`upstream-sync(${state.lastRunId ?? runId}): log resume Q&A`)
  }

  writeState({
    ...state,
    status: 'running',
    lastRunId: runId,
    activeBranch: syncBranch,
    activeMergeBase: mergeBase,
    activePrNumber: RESUME ? state.activePrNumber : null,
  })

  writeFbiReport(
    runId,
    upstreamCommits,
    'Fork maintains Arena/P2/Unipile/Facebook/Presentation integrations and mothership admin routes.'
  )
  writeSkippedReport(runId, [])

  const releaseEntries = fetchAllUpstreamReleaseNotes(detectReleaseVersions(upstreamCommits))
  const releaseNotesMarkdown = formatReleaseNotesMarkdown(releaseEntries)
  writeReleaseNotesReport(runId, releaseNotesMarkdown, releaseEntries.length)

  const agents = resolveAgents()
  const parentPrompt = substitutePrompt(readPrompt('parent-orchestrator.md'), {
    RUN_ID: runId,
    SYNC_BRANCH: syncBranch,
    UPSTREAM_SHA: headSha,
    COMMIT_COUNT: String(upstreamCommits.length),
    RELEASE_VERSIONS: releaseEntries.map((e) => e.version).join(', ') || 'none',
    RELEASE_NOTES_PATH: `.upstream-sync/ledger/${runId}/release-notes.md`,
    RELEASE_NOTES_SUMMARY: releaseNotesMarkdown.slice(0, 4000),
  })

  await runAgentPrompt({
    prompt: parentPrompt,
    name: 'parent-grill-analysis',
    branch: syncBranch,
    agent: agents.parent,
    maxIterations: 2,
  })

  try {
    runGit(['merge', '--no-edit', `${upstreamRemote()}/${upstreamBranch()}`])
  } catch {
    console.log('Merge conflicts detected — dispatching cluster children.')
  }

  const conflicts = listConflictFiles()
  const clusters = groupConflictClusters(conflicts)
  writeClusterManifest(runId, clusters)

  for (const cluster of clusters) {
    const childPrompt = substitutePrompt(readPrompt('child-resolve-conflicts.md'), {
      RUN_ID: runId,
      SYNC_BRANCH: syncBranch,
      CLUSTER_ID: cluster.id,
      CLUSTER_PREFIX: cluster.prefix,
      CLUSTER_FILES: cluster.files.map((f) => `- ${f}`).join('\n'),
    })

    await runAgentPrompt({
      prompt: childPrompt,
      name: `child-${cluster.id}`,
      branch: syncBranch,
      agent: agents.child,
      maxIterations: 5,
    })
  }

  const remaining = listConflictFiles()
  if (remaining.length > 0) {
    writeRunLog(runId, {
      Status: 'blocked',
      'Remaining conflicts': remaining.map((f) => `- ${f}`).join('\n'),
    })
    writeState({ ...readState(), status: 'awaiting_input' })

    const prBody = [
      QUESTION_MARKER,
      `## Upstream sync blocked (${runId})`,
      '',
      `${remaining.length} unresolved conflict(s). Review ledger at \`.upstream-sync/ledger/${runId}/\`.`,
      '',
      `Reply with \`${RESUME_COMMAND}\` after answering open questions.`,
    ].join('\n')

    const prNumber = state.activePrNumber ?? createDraftPr(mergeBase, syncBranch, runId, prBody)
    logHarnessQuestion(
      runId,
      prNumber,
      `${remaining.length} unresolved merge conflict(s). Review ledger and reply with ${RESUME_COMMAND}.`,
      remaining.join(', ')
    )
    syncGrillQaFromPr(prNumber, runId)
    commitUpstreamLedger(`upstream-sync(${runId}): log grill Q&A`)
    writeState({ ...readState(), activePrNumber: prNumber, status: 'awaiting_input' })
    process.exitCode = 1
    return
  }

  runGit(['add', '-A'])
  if (hasStagedChanges()) {
    runGit(['commit', '-m', `upstream-sync(${runId}): merge simstudioai/sim main`])
  }

  const verifyResults = runVerification()
  writeRunLog(runId, {
    Verification: formatVerifyResults(verifyResults),
    'Merge policy': readFileSync(MERGE_POLICY_PATH, 'utf8').slice(0, 2000),
  })

  if (!allVerificationPassed(verifyResults)) {
    writeState({ ...readState(), status: 'failed' })
    const prBody = [
      QUESTION_MARKER,
      `## Upstream sync — verification failed (${runId})`,
      '',
      formatVerifyResults(verifyResults),
      '',
      `Fix failures on \`${syncBranch}\`, then reply \`${RESUME_COMMAND}\`.`,
    ].join('\n')
    const prNumber = state.activePrNumber ?? createDraftPr(mergeBase, syncBranch, runId, prBody)
    logHarnessQuestion(
      runId,
      prNumber,
      `Verification failed on sync branch. Fix and reply with ${RESUME_COMMAND}.`,
      verifyResults.filter((r) => !r.success).map((r) => r.command).join(', ')
    )
    syncGrillQaFromPr(prNumber, runId)
    commitUpstreamLedger(`upstream-sync(${runId}): log grill Q&A`)
    writeState({ ...readState(), activePrNumber: prNumber, status: 'awaiting_input' })
    process.exitCode = 1
    return
  }

  appendExtensibilityNote(
    runId,
    '- Consider moving fork registry entries to sidecar import files to reduce registry.ts merge conflicts.'
  )

  runGit(['add', '.upstream-sync'])
  if (hasStagedChanges()) {
    runGit(['commit', '-m', `upstream-sync(${runId}): update ledger`])
  }

  const prBody = [
    `## Upstream sync — ${runId}`,
    '',
    `Merges [\`simstudioai/sim@${headSha.slice(0, 8)}\`](https://github.com/simstudioai/sim/commit/${headSha}) into \`${mergeBase}\`.`,
    '',
    `### Ledger`,
    `- [.upstream-sync/ledger/${runId}/run.md](.upstream-sync/ledger/${runId}/run.md)`,
    `- [.upstream-sync/ledger/${runId}/fbi-report.md](.upstream-sync/ledger/${runId}/fbi-report.md)`,
    `- [.upstream-sync/ledger/${runId}/release-notes.md](.upstream-sync/ledger/${runId}/release-notes.md) — **all upstream release notes since last sync**`,
    `- [.upstream-sync/ledger/${runId}/grill-qa.md](.upstream-sync/ledger/${runId}/grill-qa.md) — **grill Q&A for this run**`,
    `- [.upstream-sync/grill-log.md](.upstream-sync/grill-log.md) — **rolling grill Q&A across all runs**`,
    `- [.upstream-sync/ledger/${runId}/skipped.md](.upstream-sync/ledger/${runId}/skipped.md) — **upstream changes we declined**`,
    '',
    '### Verification',
    '✅ `bun run check` · `bun run lint` · `bun run test` · `bun run build`',
    '',
    '**Draft** — mark ready for review when satisfied.',
  ].join('\n')

  const prNumber = state.activePrNumber ?? createDraftPr(mergeBase, syncBranch, runId, prBody)
  syncGrillQaFromPr(prNumber, runId)
  commitUpstreamLedger(`upstream-sync(${runId}): log grill Q&A`)
  runGit(['push', 'origin', syncBranch])

  writeState({
    lastSyncedUpstreamSha: headSha,
    lastSyncedAt: new Date().toISOString(),
    lastRunId: runId,
    status: 'completed',
    openQuestions: [],
    activeBranch: null,
    activePrNumber: prNumber,
    activeMergeBase: null,
  })

  console.log(`Upstream sync complete. Draft PR #${prNumber} on ${syncBranch}.`)
}

main().catch((error) => {
  console.error(error)
  try {
    writeState({ ...readState(), status: 'failed' })
  } catch {
    // state file may not exist if bootstrap failed early
  }
  process.exitCode = 1
})

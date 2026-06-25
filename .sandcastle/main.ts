/**
 * Upstream sync harness — merges simstudioai/sim main into the current branch.
 *
 * Phased pipeline:
 * 1. Detect upstream changes + scaffold ledger
 * 2. Early draft PR + parent grill agent (ledger analysis only)
 * 3. Git merge upstream/main
 * 4. Child agents per conflict cluster
 * 5. Verification (check, lint, test, build)
 * 6. Update draft PR body + final ledger commit
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { run } from '@ai-hero/sandcastle'
import { noSandbox } from '@ai-hero/sandcastle/sandboxes/no-sandbox'
import { resolveAgents, assertAgentCredentials } from './lib/agents'
import {
  COMPLETION_SIGNAL,
  GRILL_COMPLETION_SIGNAL,
  MERGE_POLICY_PATH,
  QUESTION_MARKER,
  RESUME_COMMAND,
  appendExtensibilityNote,
  baseBranch,
  closeSupersededPr,
  comparePullRequestUrl,
  explainPrCreateFailure,
  isSyncBranch,
  repoSlug,
  resolveMergeBase,
  commitsSince,
  detectReleaseVersions,
  ensureUpstreamSyncScaffold,
  ensureSandcastleEnvFile,
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
  updateDraftPrBody,
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
  completionSignal?: string
}): Promise<void> {
  if (SKIP_AGENT) {
    console.log(`[skip-agent] ${options.name}`)
    return
  }

  await run({
    agent: options.agent,
    prompt: options.prompt,
    name: options.name,
    maxIterations: options.maxIterations ?? 3,
    completionSignal: options.completionSignal ?? COMPLETION_SIGNAL,
    sandbox: noSandbox(),
    branchStrategy: { type: 'head' },
    idleTimeoutSeconds: Number(process.env.UPSTREAM_SYNC_IDLE_TIMEOUT_SECONDS ?? 7200),
    completionTimeoutSeconds: 120,
    hooks: {
      sandbox: {
        onSandboxReady: [{ command: 'bun install --frozen-lockfile' }],
      },
    },
    logging: { type: 'stdout', verbose: true },
  })
}

function commitsAheadOnRemote(mergeBase: string, branch: string): number {
  try {
    runGit(['fetch', 'origin', mergeBase, branch])
    return Number(runGit(['rev-list', '--count', `origin/${mergeBase}..origin/${branch}`]))
  } catch {
    return 0
  }
}

/** GitHub rejects PRs when head and base point at the same commit on the remote. */
function ensureSyncBranchAheadOfBase(mergeBase: string, runId: string): void {
  runGit(['fetch', 'origin', mergeBase])
  const localAhead = Number(runGit(['rev-list', '--count', `origin/${mergeBase}..HEAD`]))
  if (localAhead === 0) {
    console.log(`Sync branch has no commits ahead of origin/${mergeBase} — creating scaffold commit.`)
    runGit(['commit', '--allow-empty', '-m', `upstream-sync(${runId}): open sync branch`])
  }
}

function findOpenSyncPr(mergeBase: string, branch: string): number {
  const { owner, repo } = repoSlug()
  try {
    const raw = runGh([
      'pr',
      'list',
      '--repo',
      `${owner}/${repo}`,
      '--base',
      mergeBase,
      '--head',
      `${owner}:${branch}`,
      '--state',
      'open',
      '--json',
      'number',
    ])
    const prs = JSON.parse(raw) as Array<{ number: number }>
    return prs[0]?.number ?? 0
  } catch {
    return 0
  }
}

function createDraftPr(mergeBase: string, branch: string, runId: string, body: string): number {
  if (isSyncBranch(mergeBase)) {
    const hint = explainPrCreateFailure(
      new Error(`No commits between ${mergeBase} and ${branch}`),
      mergeBase,
      branch
    )
    console.warn(`Could not create draft PR via gh: ${hint}`)
    return 0
  }

  const title = `upstream-sync: merge simstudioai/sim main into ${mergeBase} (${runId})`
  const { owner, repo } = repoSlug()
  const currentBranch = runGit(['branch', '--show-current'])

  ensureSyncBranchAheadOfBase(mergeBase, runId)
  runGit(['push', '-u', 'origin', branch])

  if (commitsAheadOnRemote(mergeBase, branch) === 0) {
    console.warn(
      `origin/${branch} still matches origin/${mergeBase} after push — adding another scaffold commit.`
    )
    runGit(['commit', '--allow-empty', '-m', `upstream-sync(${runId}): publish sync branch`])
    runGit(['push', '-u', 'origin', branch])
  }

  const existing = findOpenSyncPr(mergeBase, branch)
  if (existing > 0) {
    console.log(`Reusing open PR #${existing} for ${branch} → ${mergeBase}.`)
    updateDraftPrBody(existing, body)
    return existing
  }

  const prCreateArgs = [
    'pr',
    'create',
    '--repo',
    `${owner}/${repo}`,
    '--base',
    mergeBase,
    '--title',
    title,
    '--body',
    body,
    '--draft',
  ]
  // When checked out on the head branch, omit --head (gh handles slash names reliably).
  if (currentBranch !== branch) {
    prCreateArgs.push('--head', `${owner}:${branch}`)
  }

  try {
    const prUrl = runGh(prCreateArgs)

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
  } catch (error) {
    const compareUrl = comparePullRequestUrl(mergeBase, branch)
    const hint = explainPrCreateFailure(error, mergeBase, branch)
    console.warn(`Could not create draft PR via gh: ${hint}`)
    console.warn(`Create manually: ${compareUrl}`)
    writeRunLog(runId, {
      Status: 'pr_create_failed',
      'Compare URL': compareUrl,
      Error: error instanceof Error ? error.message : String(error),
      Hint: hint,
    })
    return 0
  }
}

/** Reuse an existing draft PR when present; otherwise create one. */
function resolveDraftPr(
  existingPrNumber: number | null | undefined,
  mergeBase: string,
  branch: string,
  runId: string,
  body: string
): number {
  if (existingPrNumber && existingPrNumber > 0) {
    try {
      updateDraftPrBody(existingPrNumber, body)
      return existingPrNumber
    } catch (error) {
      console.warn(`Could not update draft PR #${existingPrNumber}:`, error)
    }
  }
  return createDraftPr(mergeBase, branch, runId, body)
}

function commitUpstreamLedger(message: string): boolean {
  const unmerged = listConflictFiles()
  if (unmerged.length > 0) {
    console.warn(
      `Skipping ledger commit "${message}" — ${unmerged.length} unresolved merge conflict(s). Ledger files are staged locally only.`
    )
    try {
      runGit(['add', '.upstream-sync'])
    } catch {
      // staging may also fail during a messy merge state
    }
    return false
  }

  try {
    runGit(['add', '.upstream-sync'])
    if (hasStagedChanges()) {
      runGit(['commit', '-m', message])
      return true
    }
  } catch (error) {
    console.warn(`Ledger commit failed (${message}):`, error)
  }
  return false
}

async function main(): Promise<void> {
  ensureUpstreamSyncScaffold()
  assertAgentCredentials()
  ensureSandcastleEnvFile()
  fetchUpstream()

  const state = readState()
  const mergeBase = resolveMergeBase(state, RESUME)
  console.log(`Sync target: ${mergeBase} ← simstudioai/sim main (PR base)`)
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

  commitUpstreamLedger(`upstream-sync(${runId}): pre-merge ledger`)

  let activePrNumber = RESUME && state.activePrNumber ? state.activePrNumber : 0
  if (!activePrNumber) {
    const earlyPrBody = [
      QUESTION_MARKER,
      `## Upstream sync in progress — grill/analysis phase (${runId})`,
      '',
      `Branch \`${syncBranch}\` · merging [\`simstudioai/sim@${headSha.slice(0, 8)}\`](https://github.com/simstudioai/sim/commit/${headSha}) into \`${mergeBase}\`.`,
      '',
      'The parent grill agent will post questions here. Reply with `/upstream-sync resume` after answering.',
      '',
      `### Ledger (in progress)`,
      `- [.upstream-sync/ledger/${runId}/run.md](.upstream-sync/ledger/${runId}/run.md)`,
      `- [.upstream-sync/ledger/${runId}/fbi-report.md](.upstream-sync/ledger/${runId}/fbi-report.md)`,
      `- [.upstream-sync/ledger/${runId}/release-notes.md](.upstream-sync/ledger/${runId}/release-notes.md)`,
    ].join('\n')
    activePrNumber = createDraftPr(mergeBase, syncBranch, runId, earlyPrBody)
  }

  writeState({
    ...readState(),
    status: 'running',
    lastRunId: runId,
    activeBranch: syncBranch,
    activeMergeBase: mergeBase,
    activePrNumber: activePrNumber || null,
  })

  const agents = resolveAgents()
  const parentPrompt = substitutePrompt(readPrompt('parent-orchestrator.md'), {
    RUN_ID: runId,
    SYNC_BRANCH: syncBranch,
    UPSTREAM_SHA: headSha,
    COMMIT_COUNT: String(upstreamCommits.length),
    RELEASE_VERSIONS: releaseEntries.map((e) => e.version).join(', ') || 'none',
    RELEASE_NOTES_PATH: `.upstream-sync/ledger/${runId}/release-notes.md`,
    RELEASE_NOTES_SUMMARY: releaseNotesMarkdown.slice(0, 4000),
    PR_NUMBER: activePrNumber > 0 ? String(activePrNumber) : 'none',
  })

  await runAgentPrompt({
    prompt: parentPrompt,
    name: 'parent-grill-analysis',
    branch: syncBranch,
    agent: agents.parent,
    maxIterations: 1,
    completionSignal: GRILL_COMPLETION_SIGNAL,
  })

  commitUpstreamLedger(`upstream-sync(${runId}): grill analysis`)

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

    const prBody = [
      QUESTION_MARKER,
      `## Upstream sync blocked (${runId})`,
      '',
      `${remaining.length} unresolved conflict(s). Review ledger at \`.upstream-sync/ledger/${runId}/\`.`,
      '',
      `Reply with \`${RESUME_COMMAND}\` after answering open questions.`,
    ].join('\n')

    const prNumber = resolveDraftPr(activePrNumber, mergeBase, syncBranch, runId, prBody)
    logHarnessQuestion(
      runId,
      prNumber,
      `${remaining.length} unresolved merge conflict(s). Review ledger and reply with ${RESUME_COMMAND}.`,
      remaining.join(', ')
    )
    if (prNumber > 0) syncGrillQaFromPr(prNumber, runId)
    commitUpstreamLedger(`upstream-sync(${runId}): log grill Q&A`)
    writeState({ ...readState(), activePrNumber: prNumber || null, status: 'awaiting_input' })
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
    const prNumber = resolveDraftPr(activePrNumber, mergeBase, syncBranch, runId, prBody)
    logHarnessQuestion(
      runId,
      prNumber,
      `Verification failed on sync branch. Fix and reply with ${RESUME_COMMAND}.`,
      verifyResults.filter((r) => !r.success).map((r) => r.command).join(', ')
    )
    if (prNumber > 0) syncGrillQaFromPr(prNumber, runId)
    commitUpstreamLedger(`upstream-sync(${runId}): log grill Q&A`)
    writeState({ ...readState(), activePrNumber: prNumber || null, status: 'awaiting_input' })
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

  const prNumber = resolveDraftPr(activePrNumber, mergeBase, syncBranch, runId, prBody)
  if (prNumber > 0) syncGrillQaFromPr(prNumber, runId)
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

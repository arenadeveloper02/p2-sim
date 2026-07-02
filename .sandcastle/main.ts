/**
 * Upstream sync harness — merges simstudioai/sim main into the current branch.
 *
 * Phased pipeline:
 * 1. Detect upstream changes + scaffold ledger
 * 2. Early draft PR + parent grill agent (ledger analysis only)
 * 3. Git merge upstream/main
 * 4. Deterministic package-manager bootstrap
 * 5. Child agents per conflict cluster
 * 6. Verification (check, lint, test, build)
 * 7. Update draft PR body + final ledger commit
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RunResult } from '@ai-hero/sandcastle'
import { run } from '@ai-hero/sandcastle'
import { noSandbox } from '@ai-hero/sandcastle/sandboxes/no-sandbox'
import {
  commitsSinceBaseline,
  formatBaselineMetadata,
  resolveAnalysisBaseline,
} from './lib/analysis'
import { assertAgentCredentials, resolveAgents } from './lib/agents'
import {
  appendExtensibilityNote,
  appendRunLogSections,
  COMPLETION_SIGNAL,
  closeSupersededPr,
  commitSyncBranchScaffold,
  comparePullRequestUrl,
  detectReleaseVersions,
  ensureSandcastleEnvFile,
  ensureUpstreamSyncScaffold,
  explainPrCreateFailure,
  fetchAllUpstreamReleaseNotes,
  fetchUpstream,
  findOpenSyncPr,
  formatReleaseNotesMarkdown,
  GRILL_COMPLETION_SIGNAL,
  getPrReviewers,
  groupConflictClusters,
  isPrOpen,
  isSyncBranch,
  listConflictFiles,
  logHarnessQuestion,
  MERGE_POLICY_PATH,
  QUESTION_MARKER,
  RESUME_COMMAND,
  readState,
  repoSlug,
  requestPrReviewers,
  resolveMergeBase,
  runGh,
  runGit,
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
import {
  ingestGrillQaFromPr,
  parseResumePrNumber,
  resolveActivePrNumber,
  resolveResumeSyncBranch,
  shouldSkipParentGrill,
} from './lib/grill-state'
import { ensureInstallableWorkspace } from './lib/lockfile-bootstrap'
import {
  formatUsageMarkdown,
  getUsageRecords,
  recordAgentUsage,
  resetUsageRecords,
} from './lib/usage'
import { allVerificationPassed, formatVerifyResults, runVerification } from './lib/verify'

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'prompts')
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

function resolveAgentModel(
  agentKind: 'parent' | 'child',
  provider: ReturnType<typeof resolveAgents>['provider']
): string {
  if (provider === 'openai') {
    return process.env.UPSTREAM_SYNC_OPENAI_MODEL ?? 'gpt-5.5'
  }
  return agentKind === 'parent'
    ? (process.env.UPSTREAM_SYNC_ANTHROPIC_PARENT_MODEL ?? 'claude-opus-4-8')
    : (process.env.UPSTREAM_SYNC_ANTHROPIC_CHILD_MODEL ?? 'claude-sonnet-4-6')
}

const SKIP_SANDCASTLE_INSTALL_HOOKS = {
  sandbox: { onSandboxReady: [] as const },
  host: { onSandboxReady: [] as const },
}

async function runAgentPrompt(options: {
  prompt: string
  name: string
  branch: string
  runId: string
  agent: ReturnType<typeof resolveAgents>['parent']
  agentKind: 'parent' | 'child'
  provider: ReturnType<typeof resolveAgents>['provider']
  maxIterations?: number
  completionSignal?: string
}): Promise<RunResult | null> {
  if (SKIP_AGENT) {
    console.log(`[skip-agent] ${options.name}`)
    return null
  }

  if (!ensureInstallableWorkspace(options.runId)) {
    throw new Error(
      `[${options.name}] Workspace is not installable — bun.lock still has merge conflict markers.`
    )
  }

  const result = await run({
    agent: options.agent,
    prompt: options.prompt,
    name: options.name,
    maxIterations: options.maxIterations ?? 3,
    completionSignal: options.completionSignal ?? COMPLETION_SIGNAL,
    sandbox: noSandbox(),
    branchStrategy: { type: 'head' },
    hooks: SKIP_SANDCASTLE_INSTALL_HOOKS,
    idleTimeoutSeconds: Number(process.env.UPSTREAM_SYNC_IDLE_TIMEOUT_SECONDS ?? 7200),
    completionTimeoutSeconds: 120,
    logging: { type: 'stdout', verbose: true },
  })

  recordAgentUsage(options.name, resolveAgentModel(options.agentKind, options.provider), result)
  return result
}

function createDraftPrViaApi(
  mergeBase: string,
  branch: string,
  title: string,
  body: string
): number {
  const { owner, repo } = repoSlug()
  const raw = runGh([
    'api',
    '-X',
    'POST',
    `repos/${owner}/${repo}/pulls`,
    '-f',
    `title=${title}`,
    '-f',
    `head=${branch}`,
    '-f',
    `base=${mergeBase}`,
    '-f',
    `body=${body}`,
    '-f',
    'draft=true',
  ])
  const parsed = JSON.parse(raw) as { number: number }
  return parsed.number
}

function attachPrReviewers(prNumber: number): void {
  const reviewers = getPrReviewers()
  if (prNumber <= 0 || reviewers.length === 0) return
  try {
    requestPrReviewers(prNumber, reviewers)
  } catch (error) {
    console.warn(`Could not add reviewers (${reviewers.join(', ')}):`, error)
  }
}

function createDraftPr(
  mergeBase: string,
  branch: string,
  runId: string,
  body: string,
  upstreamSha: string
): number {
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

  commitSyncBranchScaffold({ runId, syncBranch: branch, mergeBase, upstreamSha })
  runGit(['push', '-u', 'origin', branch])
  runGit(['fetch', 'origin', mergeBase, branch])

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
  if (currentBranch !== branch) {
    prCreateArgs.push('--head', `${owner}:${branch}`)
  }

  try {
    const prUrl = runGh(prCreateArgs)
    const match = prUrl.match(/\/pull\/(\d+)/)
    const prNumber = match ? Number(match[1]) : 0
    attachPrReviewers(prNumber)
    return prNumber
  } catch (cliError) {
    try {
      const prNumber = createDraftPrViaApi(mergeBase, branch, title, body)
      if (prNumber > 0) {
        console.log(`Opened draft PR #${prNumber} via GitHub REST API.`)
        attachPrReviewers(prNumber)
        return prNumber
      }
    } catch (apiError) {
      const compareUrl = comparePullRequestUrl(mergeBase, branch)
      const hint = explainPrCreateFailure(apiError, mergeBase, branch)
      console.warn(`Could not create draft PR via gh: ${hint}`)
      console.warn(`CLI error: ${cliError instanceof Error ? cliError.message : String(cliError)}`)
      console.warn(`Create manually: ${compareUrl}`)
      writeRunLog(runId, {
        Status: 'pr_create_failed',
        'Compare URL': compareUrl,
        Error: apiError instanceof Error ? apiError.message : String(apiError),
        Hint: hint,
      })
      return 0
    }
    return 0
  }
}

/** Reuse an existing draft PR when present; otherwise create one. */
function resolveDraftPr(
  existingPrNumber: number | null | undefined,
  mergeBase: string,
  branch: string,
  runId: string,
  body: string,
  upstreamSha: string
): number {
  return ensureActiveDraftPr({
    existingPrNumber: existingPrNumber ?? 0,
    mergeBase,
    syncBranch: branch,
    runId,
    headSha: upstreamSha,
    body,
  })
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

function persistActiveSyncState(options: {
  runId: string
  syncBranch: string
  mergeBase: string
  activePrNumber: number | null
}): void {
  writeState({
    ...readState(),
    status: 'running',
    lastRunId: options.runId,
    activeBranch: options.syncBranch,
    activeMergeBase: options.mergeBase,
    activePrNumber: options.activePrNumber,
  })
  commitUpstreamLedger(`upstream-sync(${options.runId}): active sync state`)
}

function appendUsageToRunLog(runId: string): string {
  const usageMarkdown = formatUsageMarkdown(getUsageRecords())
  appendRunLogSections(runId, { Usage: usageMarkdown })
  return usageMarkdown
}

function ensureActiveDraftPr(options: {
  existingPrNumber: number
  mergeBase: string
  syncBranch: string
  runId: string
  headSha: string
  body: string
}): number {
  if (options.existingPrNumber > 0 && isPrOpen(options.existingPrNumber)) {
    try {
      updateDraftPrBody(options.existingPrNumber, options.body)
    } catch (error) {
      console.warn(`Could not update draft PR #${options.existingPrNumber}:`, error)
    }
    return options.existingPrNumber
  }

  const discovered = findOpenSyncPr(options.mergeBase, options.syncBranch)
  if (discovered > 0) {
    try {
      updateDraftPrBody(discovered, options.body)
    } catch (error) {
      console.warn(`Could not update draft PR #${discovered}:`, error)
    }
    return discovered
  }

  try {
    runGit(['push', '-u', 'origin', options.syncBranch])
  } catch (error) {
    console.warn(`Could not push ${options.syncBranch} before opening draft PR:`, error)
  }

  return createDraftPr(
    options.mergeBase,
    options.syncBranch,
    options.runId,
    options.body,
    options.headSha
  )
}

async function main(): Promise<void> {
  resetUsageRecords()
  ensureUpstreamSyncScaffold()
  assertAgentCredentials()
  ensureSandcastleEnvFile()
  fetchUpstream()

  const initialState = readState()
  const mergeBase = resolveMergeBase(initialState, RESUME)
  console.log(`Sync target: ${mergeBase} ← simstudioai/sim main (PR base)`)

  const baseline = resolveAnalysisBaseline(mergeBase, initialState)
  const headSha = baseline.upstreamHeadSha
  const runId = todayRunId()
  const upstreamCommits = commitsSinceBaseline(baseline)

  appendRunLogSections(runId, {
    'Sync topology': formatBaselineMetadata(baseline, upstreamCommits.length),
  })

  if (!FORCE_RUN && !RESUME && initialState.lastSyncedUpstreamSha === headSha) {
    console.log(`No upstream changes (already at ${headSha.slice(0, 8)}).`)
    return
  }

  if (upstreamCommits.length === 0 && !FORCE_RUN && !RESUME) {
    console.log('No new upstream commits.')
    writeState({ ...initialState, lastSyncedUpstreamSha: headSha, status: 'idle' })
    return
  }

  let syncBranch: string
  const resuming = RESUME
  if (resuming) {
    syncBranch = resolveResumeSyncBranch(initialState)
  } else {
    if (initialState.activePrNumber) {
      closeSupersededPr(initialState.activePrNumber, {
        newUpstreamSha: headSha,
        runId,
        newBranch: syncBranchName(),
      })
    }
    syncBranch = syncBranchName()
  }

  checkoutSyncBranch(syncBranch, resuming)

  if (resuming || listConflictFiles().length > 0) {
    if (!ensureInstallableWorkspace(runId)) {
      appendRunLogSections(runId, {
        Status: 'blocked',
        'Package bootstrap':
          'Could not regenerate bun.lock while resuming. Resolve package.json conflicts manually, then resume.',
      })
      writeState({ ...readState(), status: 'awaiting_input' })
      process.exitCode = 1
      return
    }
    try {
      runGit(['push', 'origin', syncBranch])
    } catch (error) {
      console.warn(`Could not push bootstrapped ${syncBranch}:`, error)
    }
  }

  const branchState = readState()
  const resumePrNumber = parseResumePrNumber()
  let activePrNumber = resolveActivePrNumber({
    state: branchState,
    mergeBase,
    syncBranch,
    resumePrNumber,
  })

  let workingState = branchState
  if (RESUME && activePrNumber > 0) {
    const ingested = ingestGrillQaFromPr(
      activePrNumber,
      branchState.lastRunId ?? runId,
      workingState
    )
    workingState = ingested.state
    if (ingested.added > 0) {
      console.log(`Synced ${ingested.added} grill Q&A comment(s) from PR #${activePrNumber}.`)
    }
    commitUpstreamLedger(
      `upstream-sync(${branchState.lastRunId ?? runId}): log resume Q&A`
    )
  }

  writeState({
    ...workingState,
    status: 'running',
    lastRunId: runId,
    activeBranch: syncBranch,
    activeMergeBase: mergeBase,
    activePrNumber: activePrNumber || null,
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

  const earlyPrBody = [
    QUESTION_MARKER,
    `## Upstream sync in progress — grill/analysis phase (${runId})`,
    '',
    `Branch \`${syncBranch}\` · merging [\`simstudioai/sim@${headSha.slice(0, 8)}\`](https://github.com/simstudioai/sim/commit/${headSha}) into \`${mergeBase}\`.`,
    '',
    `**Sync range:** ${upstreamCommits.length} commit(s) since \`${baseline.baselineSha.slice(0, 8)}\` (${baseline.baselineSource}).`,
    '',
    'The parent grill agent will post questions here. Reply with `/upstream-sync resume` after answering.',
    '',
    `### Ledger (in progress)`,
    `- [.upstream-sync/ledger/${runId}/run.md](.upstream-sync/ledger/${runId}/run.md)`,
    `- [.upstream-sync/ledger/${runId}/fbi-report.md](.upstream-sync/ledger/${runId}/fbi-report.md)`,
    `- [.upstream-sync/ledger/${runId}/release-notes.md](.upstream-sync/ledger/${runId}/release-notes.md)`,
  ].join('\n')

  activePrNumber = ensureActiveDraftPr({
    existingPrNumber: activePrNumber,
    mergeBase,
    syncBranch,
    runId,
    headSha,
    body: earlyPrBody,
  })

  persistActiveSyncState({
    runId,
    syncBranch,
    mergeBase,
    activePrNumber: activePrNumber || null,
  })

  const agents = resolveAgents()
  const skipParentGrill = shouldSkipParentGrill({ resume: RESUME, prNumber: activePrNumber })

  if (skipParentGrill) {
    console.log(
      `Skipping parent grill — resume answer found on PR #${activePrNumber}. Proceeding to merge.`
    )
    appendRunLogSections(runId, {
      'Grill analysis':
        'Skipped on resume. Human answers were recorded in `grill-log.md` / `qa-history.jsonl` — do not re-ask the same decisions.',
    })
  } else if (!SKIP_AGENT) {
    const parentPrompt = substitutePrompt(readPrompt('parent-orchestrator.md'), {
      RUN_ID: runId,
      SYNC_BRANCH: syncBranch,
      UPSTREAM_SHA: headSha,
      COMMIT_COUNT: String(upstreamCommits.length),
      BASELINE_SHA: baseline.baselineSha,
      BASELINE_SOURCE: baseline.baselineSource,
      RELEASE_VERSIONS: releaseEntries.map((e) => e.version).join(', ') || 'none',
      RELEASE_NOTES_PATH: `.upstream-sync/ledger/${runId}/release-notes.md`,
      RELEASE_NOTES_SUMMARY: releaseNotesMarkdown.slice(0, 4000),
      PR_NUMBER: activePrNumber > 0 ? String(activePrNumber) : 'none',
      RESUME_MODE: RESUME ? 'yes' : 'no',
    })

    await runAgentPrompt({
      prompt: parentPrompt,
      name: 'parent-grill-analysis',
      branch: syncBranch,
      runId,
      agent: agents.parent,
      agentKind: 'parent',
      provider: agents.provider,
      maxIterations: 1,
      completionSignal: GRILL_COMPLETION_SIGNAL,
    })

    commitUpstreamLedger(`upstream-sync(${runId}): grill analysis`)
  } else {
    console.log('[skip-agent] parent-grill-analysis')
  }

  try {
    runGit(['merge', '--no-edit', `${upstreamRemote()}/${upstreamBranch()}`])
  } catch {
    console.log('Merge conflicts detected — bootstrapping package manager before child agents.')
  }

  if (!ensureInstallableWorkspace(runId)) {
    appendRunLogSections(runId, {
      Status: 'blocked',
      'Package bootstrap':
        'Could not regenerate bun.lock after merge. Resolve package.json conflicts manually, then resume.',
    })
    const prNumber = ensureActiveDraftPr({
      existingPrNumber: activePrNumber,
      mergeBase,
      syncBranch,
      runId,
      headSha,
      body: [
        QUESTION_MARKER,
        `## Upstream sync blocked (${runId})`,
        '',
        'Package manager bootstrap failed — bun.lock still has merge conflict markers.',
        '',
        `Reply with \`${RESUME_COMMAND}\` after fixing manifests manually.`,
      ].join('\n'),
    })
    writeState({ ...readState(), activePrNumber: prNumber || null, status: 'awaiting_input' })
    process.exitCode = 1
    return
  }

  try {
    runGit(['push', 'origin', syncBranch])
  } catch (error) {
    console.warn(`Could not push ${syncBranch} after package bootstrap:`, error)
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
      PR_NUMBER: activePrNumber > 0 ? String(activePrNumber) : 'none',
    })

    await runAgentPrompt({
      prompt: childPrompt,
      name: `child-${cluster.id}`,
      branch: syncBranch,
      runId,
      agent: agents.child,
      agentKind: 'child',
      provider: agents.provider,
      maxIterations: 5,
    })
  }

  const remaining = listConflictFiles()
  if (remaining.length > 0) {
    appendUsageToRunLog(runId)
    appendRunLogSections(runId, {
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

    const prNumber = resolveDraftPr(activePrNumber, mergeBase, syncBranch, runId, prBody, headSha)
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
  const usageSection = appendUsageToRunLog(runId)
  appendRunLogSections(runId, {
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
      '',
      '### Agent usage',
      usageSection,
    ].join('\n')
    const prNumber = resolveDraftPr(activePrNumber, mergeBase, syncBranch, runId, prBody, headSha)
    logHarnessQuestion(
      runId,
      prNumber,
      `Verification failed on sync branch. Fix and reply with ${RESUME_COMMAND}.`,
      verifyResults
        .filter((r) => !r.success)
        .map((r) => r.command)
        .join(', ')
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

  const usageSectionFinal = appendUsageToRunLog(runId)
  const prBody = [
    `## Upstream sync — ${runId}`,
    '',
    `Merges [\`simstudioai/sim@${headSha.slice(0, 8)}\`](https://github.com/simstudioai/sim/commit/${headSha}) into \`${mergeBase}\`.`,
    '',
    `**Sync range:** ${upstreamCommits.length} commit(s) since \`${baseline.baselineSha.slice(0, 8)}\` (${baseline.baselineSource}).`,
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
    '### Agent usage',
    usageSectionFinal,
    '',
    '**Draft** — mark ready for review when satisfied.',
  ].join('\n')

  const prNumber = resolveDraftPr(activePrNumber, mergeBase, syncBranch, runId, prBody, headSha)
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

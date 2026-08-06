/**
 * Upstream sync harness — merges simstudioai/sim main into the current branch.
 *
 * Phased pipeline:
 * 1. Detect upstream changes + scaffold ledger
 * 2. Early draft PR + parent grill (Phase A: resolutions + draft child plan)
 * 3. Gate on unanswered grill questions (await `/upstream-sync resume`)
 * 4. Git merge next upstream release tip (until_sha / max_commits are smoke escapes)
 * 5. Package bootstrap → WIP overlay (decisionHash) → parent finalize (Phase B; resume continues from cluster reports)
 * 6. Apply merge directives + deterministic policy (forkFirst overrides / mustEdit)
 * 7. Luna children from merge-plan.json clusters (fallback prefix grouping if plan missing)
 * 8. Always-on coherence pass; advisory check/lint/test (full build left to CI)
 * 9. Update draft PR body + final ledger commit; chain next release as a stacked PR on success
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { AgentStreamEvent, RunResult } from '@ai-hero/sandcastle'
import { run } from '@ai-hero/sandcastle'
import { noSandbox } from '@ai-hero/sandcastle/sandboxes/no-sandbox'
import { getErrorMessage } from '@sim/utils/errors'
import { sleep } from '@sim/utils/helpers'
import { backoffWithJitter } from '@sim/utils/retry'
import {
  assertAgentCredentials,
  ensureNonInteractivePagers,
  isTransientModelCapacityError,
  resolveAgentIdleTimeoutSeconds,
  resolveAgents,
  resolveCapacityRetryConfig,
} from './lib/agents'
import {
  commitsSinceBaseline,
  formatBaselineMetadata,
  resolveAnalysisBaseline,
  resolveCappedUpstreamTip,
  resolveNextReleaseTip,
  WAITING_FOR_NEXT_RELEASE,
} from './lib/analysis'
import {
  clusterReportPath,
  formatClusterReportTable,
  formatCompletedClusterProgress,
  readClusterReport,
  validateClusterReport,
} from './lib/cluster-report'
import type { ConflictCluster } from './lib/clusters'
import {
  appendExtensibilityNote,
  appendRunLogSections,
  applyMergeWip,
  baseBranch,
  bootstrapStackFromActive,
  COMPLETION_SIGNAL,
  closeOpenStackPrs,
  closeSupersededPr,
  commitHarness,
  commitSyncBranchScaffold,
  comparePullRequestUrl,
  decideSyncBranchAction,
  detectReleaseVersions,
  dispatchUpstreamSyncWorkflow,
  ensureSandcastleEnvFile,
  ensureUpstreamSyncScaffold,
  explainPrCreateFailure,
  fetchAllUpstreamReleaseNotes,
  fetchUpstream,
  findOpenSyncPr,
  formatReleaseNotesMarkdown,
  formatStackTableMarkdown,
  formatSyncPrTitle,
  GRILL_COMPLETION_SIGNAL,
  getPrReviewers,
  groupConflictClusters,
  isPrOpen,
  isTipSliceCompleted,
  leafConflictClusters,
  listConflictFiles,
  logHarnessQuestion,
  MERGE_POLICY_PATH,
  persistMergeWip,
  QUESTION_MARKER,
  RESUME_COMMAND,
  readState,
  remoteBranchExists,
  repoSlug,
  requestPrReviewers,
  resolveMergeBase,
  resolvePrHeadBranch,
  restoreWipLedger,
  runGh,
  runGit,
  type SyncStackEntry,
  splitLeftoverCluster,
  substitutePrompt,
  syncGrillQaFromPr,
  throwIfRemotePushAuthError,
  todayRunId,
  updateDraftPr,
  upsertStackTip,
  walkConflictClusters,
  writeClusterManifest,
  writeFbiReport,
  writeReleaseNotesReport,
  writeRunLog,
  writeSkippedReport,
  writeState,
} from './lib/config'
import {
  clearOpenQuestionsFile,
  hasUnansweredGrillQuestions,
  ingestGrillQaFromPr,
  parseResumePrNumber,
  resolveActivePrNumber,
  resolveResumeSyncBranch,
  shouldSkipParentGrill,
} from './lib/grill-state'
import { verificationToOutcome, writeRunOutcome } from './lib/job-summary'
import {
  ensureInstallableWorkspace,
  resolveDeterministicPolicyConflicts,
} from './lib/lockfile-bootstrap'
import {
  applyMergeDirectives,
  clustersFromMergePlan,
  collectGrillAnswerIds,
  computeDecisionHashFromDisk,
  computeRunDecisionHash,
  emptyMergeDirectives,
  formatMergePlanSlice,
  formatParentPlanSummary,
  loadFinalDirectives,
  readMergePlanDraft,
  readMergePlanFinal,
  restrictMergeDirectivesToUnmerged,
} from './lib/merge-plan'
import {
  formatStackUsageRollupMarkdown,
  getUsageRecords,
  loadStackUsage,
  persistUsageArtifacts,
  recordAgentUsage,
  recoverUsageFromLogDir,
  resetUsageRecords,
  writeStackUsageJson,
} from './lib/usage'
import {
  allBlockingVerificationPassed,
  allVerificationPassed,
  autofixFormat,
  formatVerifyResults,
  formatVerifyStatusLine,
  runVerification,
} from './lib/verify'

const PROMPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'prompts')
const SKIP_AGENT = process.env.UPSTREAM_SYNC_SKIP_AGENT === 'true'
const FORCE_RUN = process.env.UPSTREAM_SYNC_FORCE === 'true'
const RESUME = process.env.UPSTREAM_SYNC_RESUME === 'true'
const COHERENCE_REASON =
  'Always-on coherence pass after conflicts cleared (or none existed): verify import graph, restore missing upstream exports on fork-kept / union files, and honor grill directives (`delete` / `mustEdit` / `overrideForkFirst`). Do not no-op just because `git diff --diff-filter=U` is empty.'

/** Active ledger run id for cancel/error flush handlers. */
let activeRunId: string | null = null
let usageFlushCompleted = false

function hasStagedChanges(): boolean {
  try {
    runGit(['diff', '--cached', '--quiet'])
    return false
  } catch {
    return true
  }
}

/**
 * Last-chance child agent for leftover unmerged paths or a failed merge commit.
 */
async function runFinalizeMergeAgent(options: {
  runId: string
  syncBranch: string
  activePrNumber: number
  agents: ReturnType<typeof resolveAgents>
  remaining: string[]
  reason: string
  commitError?: string
}): Promise<string[]> {
  const fileList =
    options.remaining.length > 0
      ? options.remaining.map((f) => `- ${f}`).join('\n')
      : '- (no unmerged paths listed — inspect commit error and search for conflict markers)'

  const childPrompt = substitutePrompt(readPrompt('child-finalize-merge.md'), {
    RUN_ID: options.runId,
    SYNC_BRANCH: options.syncBranch,
    PR_NUMBER: options.activePrNumber > 0 ? String(options.activePrNumber) : 'none',
    FINALIZE_REASON: options.reason,
    REMAINING_FILES: fileList,
    COMMIT_ERROR: options.commitError?.slice(0, 4000) || '(none)',
  })

  await runAgentPrompt({
    prompt: childPrompt,
    name: 'child-finalize-merge',
    branch: options.syncBranch,
    runId: options.runId,
    agent: options.agents.child,
    agentKind: 'child',
    agents: options.agents,
    maxIterations: 5,
  })

  return listConflictFiles()
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return fallback
  return Math.floor(n)
}

/**
 * Run a conflict-cluster forest: structural parents recurse into children;
 * leaves invoke a child agent; leftovers are dynamically re-clustered.
 */
async function runConflictClusterForest(options: {
  roots: ConflictCluster[]
  runId: string
  syncBranch: string
  activePrNumber: number
  agents: ReturnType<typeof resolveAgents>
  conflictSnapshot: string[]
  decisionHash: string
}): Promise<void> {
  const maxDynamicRounds = readPositiveIntEnv('UPSTREAM_SYNC_CLUSTER_MAX_DYNAMIC_ROUNDS', 2)

  async function runNode(cluster: ConflictCluster, dynamicRound: number): Promise<void> {
    if (cluster.children.length > 0) {
      console.log(
        `[cluster] ${cluster.id} structural (${cluster.children.length} children, prefix=${cluster.prefix})`
      )
      for (const child of cluster.children) {
        await runNode(child, dynamicRound)
      }
      return
    }

    if (cluster.files.length === 0) {
      console.log(`[cluster] ${cluster.id} empty leaf — skipping`)
      return
    }

    // Skip files already resolved by a sibling / policy pass.
    const stillUnmerged = new Set(listConflictFiles())
    const assigned = cluster.files.filter((f) => stillUnmerged.has(f))
    if (assigned.length === 0) {
      console.log(`[cluster] ${cluster.id} already resolved — skipping`)
      return
    }

    console.log(
      `[cluster] ${cluster.id} leaf depth=${cluster.depth} files=${assigned.length} prefix=${cluster.prefix}`
    )

    const sliceCluster: ConflictCluster = { ...cluster, files: assigned }
    const childPrompt = substitutePrompt(readPrompt('child-resolve-conflicts.md'), {
      RUN_ID: options.runId,
      SYNC_BRANCH: options.syncBranch,
      CLUSTER_ID: cluster.id,
      CLUSTER_PARENT_ID: cluster.parentId ?? '(root)',
      CLUSTER_DEPTH: String(cluster.depth),
      CLUSTER_PREFIX: cluster.prefix,
      CLUSTER_STRATEGY: cluster.strategy ?? 'manual',
      CLUSTER_NOTES: cluster.notes?.trim() || '_No parent notes._',
      MERGE_PLAN_SLICE: formatMergePlanSlice(sliceCluster),
      CLUSTER_FILE_COUNT: String(assigned.length),
      CLUSTER_FILES: assigned.map((f) => `- ${f}`).join('\n'),
      PR_NUMBER: options.activePrNumber > 0 ? String(options.activePrNumber) : 'none',
    })

    await runAgentPrompt({
      prompt: childPrompt,
      name: `child-${cluster.id}`,
      branch: options.syncBranch,
      runId: options.runId,
      agent: options.agents.child,
      agentKind: 'child',
      agents: options.agents,
      maxIterations: 5,
    })

    persistMergeWip({
      syncBranch: options.syncBranch,
      runId: options.runId,
      clusterId: cluster.id,
      conflictSnapshot: options.conflictSnapshot,
      decisionHash: options.decisionHash,
    })
    recordClusterReport(options.runId, cluster.id)
    stageMergePolicyIfPresent()

    if (dynamicRound >= maxDynamicRounds) return

    const after = new Set(listConflictFiles())
    const leftovers = assigned.filter((f) => after.has(f))
    if (leftovers.length === 0) return
    if (leftovers.length === assigned.length) {
      console.warn(
        `[cluster] ${cluster.id} made no progress on ${leftovers.length} file(s) — skipping dynamic re-split`
      )
      return
    }

    const nextRound = dynamicRound + 1
    const childRoots = splitLeftoverCluster(cluster, leftovers, { round: nextRound })
    if (childRoots.length === 0) {
      console.log(
        `[cluster] ${cluster.id} ${leftovers.length} leftover(s) — cannot usefully re-split`
      )
      return
    }

    console.log(
      `[cluster] ${cluster.id} dynamic round ${nextRound}: ${leftovers.length} leftover(s) → ${leafConflictClusters(childRoots).length} child leaf(ves)`
    )
    for (const child of childRoots) {
      child.strategy = cluster.strategy
      child.notes = cluster.notes
      await runNode(child, nextRound)
    }
  }

  for (const root of options.roots) {
    await runNode(root, 0)
  }
}

function recordParentPlanFromDraft(runId: string): void {
  const draft = readMergePlanDraft(runId)
  if (!draft) {
    console.warn(`[merge-plan] No draft plan at merge-plan.draft.json after grill (${runId})`)
    return
  }
  appendRunLogSections(runId, { 'Parent plan': formatParentPlanSummary(draft) })
}

async function runParentFinalizePlan(options: {
  runId: string
  syncBranch: string
  upstreamSha: string
  activePrNumber: number
  agents: ReturnType<typeof resolveAgents>
  wipOverlayStatus: string
}): Promise<void> {
  const unmerged = listConflictFiles()
  const priorFinal = readMergePlanFinal(options.runId)
  const completedProgress = formatCompletedClusterProgress(options.runId)
  const prompt = substitutePrompt(readPrompt('parent-finalize-plan.md'), {
    RUN_ID: options.runId,
    SYNC_BRANCH: options.syncBranch,
    UPSTREAM_SHA: options.upstreamSha,
    PR_NUMBER: options.activePrNumber > 0 ? String(options.activePrNumber) : 'none',
    UNMERGED_PATHS:
      unmerged.length > 0
        ? unmerged.map((file) => `- ${file}`).join('\n')
        : '- (none — still write a final plan with empty childClusters and locked directives)',
    WIP_OVERLAY_STATUS: options.wipOverlayStatus,
    COMPLETED_CLUSTER_PROGRESS:
      completedProgress ||
      '- (none yet — first finalize this run, or children have not written reports)',
    PRIOR_FINAL_PLAN_PATH: priorFinal
      ? `.upstream-sync/ledger/${options.runId}/merge-plan.json`
      : '(none — first finalize this run)',
    PRIOR_FINAL_PLAN_SUMMARY: priorFinal
      ? formatParentPlanSummary(priorFinal)
      : '- (none — first finalize this run)',
    DRAFT_PLAN_PATH: `.upstream-sync/ledger/${options.runId}/merge-plan.draft.json`,
    OPEN_QUESTIONS_PATH: `.upstream-sync/ledger/${options.runId}/open-questions.md`,
    GRILL_QA_PATH: `.upstream-sync/ledger/${options.runId}/grill-qa.md`,
    QA_HISTORY_PATH: '.upstream-sync/qa-history.jsonl',
  })

  await runAgentPrompt({
    prompt,
    name: 'parent-finalize-plan',
    branch: options.syncBranch,
    runId: options.runId,
    agent: options.agents.parent,
    agentKind: 'parent',
    agents: options.agents,
    maxIterations: 2,
    completionSignal: GRILL_COMPLETION_SIGNAL,
  })

  commitUpstreamLedger(`upstream-sync(${options.runId}): finalize merge plan`)
}

function recordClusterReport(runId: string, clusterId: string): void {
  const report = readClusterReport(runId, clusterId)
  if (report) {
    appendRunLogSections(runId, {
      [`Cluster ${clusterId}`]: formatClusterReportTable(report),
    })
    return
  }

  const path = clusterReportPath(runId, clusterId)
  if (!existsSync(path)) {
    console.warn(`[cluster] ${clusterId} did not write a cluster report`)
    return
  }

  try {
    const parsed = validateClusterReport(JSON.parse(readFileSync(path, 'utf8')))
    if (!parsed.ok) {
      console.warn(`[cluster] ${clusterId} report invalid: ${parsed.error}`)
    }
  } catch (error) {
    console.warn(`[cluster] ${clusterId} report could not be parsed:`, error)
  }
}

function stageMergePolicyIfPresent(): void {
  try {
    runGit(['add', '--', MERGE_POLICY_PATH])
  } catch {
    // merge-policy may be unchanged or unreadable mid-merge
  }
}

function readPrompt(name: string): string {
  return readFileSync(join(PROMPTS_DIR, name), 'utf8')
}

function syncBranchName(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `upstream-sync/${stamp}`
}

function checkoutSyncBranch(syncBranch: string, reuseExisting: boolean): void {
  if (reuseExisting) {
    runGit(['fetch', 'origin', syncBranch])
    runGit(['checkout', syncBranch])
    return
  }

  runGit(['checkout', '-B', syncBranch])
}

function resolveAgentModel(
  agentKind: 'parent' | 'child',
  agents: ReturnType<typeof resolveAgents>
): string {
  return agentKind === 'parent' ? agents.parentModel : agents.childModel
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
  agents: ReturnType<typeof resolveAgents>
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

  // File + verbose logging is required so we can capture Claude stream-json NDJSON
  // (Sandcastle's Claude parser never emits usage events; result.stdout is text-only).
  const logDir = join(process.cwd(), '.sandcastle', 'logs')
  mkdirSync(logDir, { recursive: true })
  const safeName = options.name.replace(/[^a-zA-Z0-9_-]+/g, '_')
  const logPath = join(logDir, `${safeName}.log`)
  const model = resolveAgentModel(options.agentKind, options.agents)
  const capacityRetry = resolveCapacityRetryConfig()
  const idleTimeoutSeconds = resolveAgentIdleTimeoutSeconds(options.agentKind)
  console.log(
    `[agent] starting ${options.name} (${options.agentKind}, model=${model}, idleTimeout=${idleTimeoutSeconds}s)`
  )

  let lastError: unknown
  for (let attempt = 1; attempt <= capacityRetry.maxAttempts; attempt++) {
    const rawNdjsonLines: string[] = []
    let result: RunResult | null = null
    try {
      result = await run({
        agent: options.agent,
        prompt: options.prompt,
        name: options.name,
        maxIterations: options.maxIterations ?? 3,
        completionSignal: options.completionSignal ?? COMPLETION_SIGNAL,
        sandbox: noSandbox(),
        branchStrategy: { type: 'head' },
        hooks: SKIP_SANDCASTLE_INSTALL_HOOKS,
        idleTimeoutSeconds,
        completionTimeoutSeconds: 120,
        logging: {
          type: 'file',
          path: logPath,
          verbose: true,
          onAgentStreamEvent: (event: AgentStreamEvent) => {
            if (event.type !== 'raw') return
            rawNdjsonLines.push(event.line)
            // Mirror into Actions logs (parity with previous stdout verbose mode).
            console.log(event.line)
          },
        },
      })
      recordAttemptUsage(options.name, model, result, rawNdjsonLines, logPath)
      return result
    } catch (error) {
      lastError = error
      recordAttemptUsage(options.name, model, result, rawNdjsonLines, logPath)

      const canRetry = isTransientModelCapacityError(error) && attempt < capacityRetry.maxAttempts
      if (!canRetry) throw error

      const delayMs = backoffWithJitter(attempt, null, {
        baseMs: capacityRetry.baseMs,
        maxMs: capacityRetry.maxMs,
      })
      console.warn(
        `[${options.name}] model capacity error (attempt ${attempt}/${capacityRetry.maxAttempts}); ` +
          `retrying in ${Math.round(delayMs / 1000)}s — ${getErrorMessage(error)}`
      )
      await sleep(delayMs)
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/**
 * Always record usage — including cancelled / errored runs — from captured
 * stream NDJSON (or the verbose log file if the callback buffer is empty).
 */
function recordAttemptUsage(
  agentName: string,
  model: string,
  result: RunResult | null,
  rawNdjsonLines: string[],
  logPath: string
): void {
  let streamNdjson = rawNdjsonLines.join('\n')
  if (!streamNdjson.trim() && existsSync(logPath)) {
    try {
      streamNdjson = readFileSync(logPath, 'utf8')
    } catch {
      // best-effort
    }
  }
  recordAgentUsage(agentName, model, result, streamNdjson)
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
  upstreamSha: string,
  title?: string
): number {
  const prTitle = title ?? formatSyncPrTitle({ mergeBase, runId })
  const { owner, repo } = repoSlug()
  const currentBranch = runGit(['branch', '--show-current'])

  commitSyncBranchScaffold({ runId, syncBranch: branch, mergeBase, upstreamSha })
  runGit(['push', '-u', 'origin', branch])
  runGit(['fetch', 'origin', mergeBase, branch])

  const existing = findOpenSyncPr(mergeBase, branch)
  if (existing > 0) {
    console.log(`Reusing open PR #${existing} for ${branch} → ${mergeBase}.`)
    updateDraftPr(existing, { title: prTitle, body })
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
    prTitle,
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
      const prNumber = createDraftPrViaApi(mergeBase, branch, prTitle, body)
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
  upstreamSha: string,
  title?: string
): number {
  return ensureActiveDraftPr({
    existingPrNumber: existingPrNumber ?? 0,
    mergeBase,
    syncBranch: branch,
    runId,
    headSha: upstreamSha,
    body,
    title,
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
      commitHarness(message)
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
  activeUpstreamSha: string | null
  stack?: SyncStackEntry[]
}): void {
  const prev = readState()
  writeState({
    ...prev,
    status: 'running',
    lastRunId: options.runId,
    activeBranch: options.syncBranch,
    activeMergeBase: options.mergeBase,
    activePrNumber: options.activePrNumber,
    activeUpstreamSha: options.activeUpstreamSha,
    stack: options.stack ?? prev.stack,
  })
  commitUpstreamLedger(`upstream-sync(${options.runId}): active sync state`)
}

function buildStackUsageSections(options: { runId: string; stack: readonly SyncStackEntry[] }): {
  rollupMarkdown: string
  detailedMarkdown: string
} {
  const rollup = loadStackUsage({
    stack: options.stack,
    thisRunId: options.runId,
    thisSliceRecords: getUsageRecords(),
  })
  try {
    writeStackUsageJson(options.runId, rollup)
  } catch (error) {
    console.warn('Could not write stack-usage.json:', error)
  }
  return {
    rollupMarkdown: formatStackUsageRollupMarkdown(rollup),
    detailedMarkdown: persistUsageArtifacts(options.runId),
  }
}

function maybeDispatchNextReleaseSlice(options: {
  syncedSha: string
  upstreamHeadSha: string
  tipReason: string
}): void {
  if (
    !options.tipReason.startsWith('next-release') &&
    !options.tipReason.startsWith('active-upstream-sha')
  ) {
    return
  }

  try {
    const remaining = resolveNextReleaseTip({
      baselineSha: options.syncedSha,
      upstreamHeadSha: options.upstreamHeadSha,
    })
    if (remaining.kind !== 'release') {
      console.log('No further upstream releases to chain.')
      return
    }

    if (process.env.GITHUB_ACTIONS !== 'true') {
      console.log(
        `Further upstream release ${remaining.version} (${remaining.tipSha.slice(0, 8)}) remains; skip workflow dispatch outside Actions.`
      )
      return
    }

    dispatchUpstreamSyncWorkflow()
  } catch (error) {
    console.warn('Could not dispatch next upstream-sync release slice:', error)
  }
}

function appendUsageToRunLog(runId: string, stack?: readonly SyncStackEntry[]): string {
  const { rollupMarkdown, detailedMarkdown } = buildStackUsageSections({
    runId,
    stack: stack ?? readState().stack,
  })
  appendRunLogSections(runId, {
    Usage: [rollupMarkdown, '', detailedMarkdown].join('\n'),
  })
  usageFlushCompleted = true
  return [rollupMarkdown, '', detailedMarkdown].join('\n')
}

/**
 * Best-effort usage flush for workflow cancel / harness errors.
 * Recovers from Sandcastle log files when in-memory records are empty, writes
 * ledger + step summary, and tries to commit (push is left to the always() CI step).
 */
function flushUsageBestEffort(reason: string): string | null {
  if (usageFlushCompleted) return null
  const runId =
    activeRunId ??
    (() => {
      try {
        return readState().lastRunId ?? todayRunId()
      } catch {
        return todayRunId()
      }
    })()

  try {
    if (getUsageRecords().length === 0) {
      const logDir = join(process.cwd(), '.sandcastle', 'logs')
      recoverUsageFromLogDir(logDir)
    }
    if (getUsageRecords().length === 0) {
      console.log(`[usage] flush skipped (${reason}): no agent usage to record`)
      usageFlushCompleted = true
      return null
    }

    console.log(`[usage] flushing artifacts (${reason}) for run ${runId}`)
    const markdown = appendUsageToRunLog(runId)
    commitUpstreamLedger(`upstream-sync(${runId}): agent usage (${reason})`)
    usageFlushCompleted = true
    return markdown
  } catch (error) {
    console.warn(`[usage] flush failed (${reason}):`, error)
    return null
  }
}

function installUsageFlushHandlers(): void {
  const onSignal = (signal: NodeJS.Signals) => {
    console.warn(`[usage] received ${signal} — flushing agent usage before exit`)
    flushUsageBestEffort(`signal:${signal}`)
    try {
      const runId = activeRunId ?? readState().lastRunId ?? todayRunId()
      const state = readState()
      writeRunOutcome(runId, {
        kind: 'cancelled',
        title: `Workflow cancelled (${signal})`,
        detail: 'Actions sent a termination signal. Partial usage/conflicts recovered below.',
        syncBranch: state.activeBranch,
        mergeBase: state.activeMergeBase,
        upstreamSha: state.lastSyncedUpstreamSha,
        prNumber: state.activePrNumber,
        remainingConflicts: (() => {
          try {
            return listConflictFiles()
          } catch {
            return []
          }
        })(),
      })
      writeState({ ...state, status: 'failed' })
    } catch {
      // best-effort
    }
    // Re-raise default behavior after flush so Actions still marks the job cancelled.
    process.exitCode = process.exitCode ?? 1
    process.exit()
  }
  process.once('SIGTERM', () => onSignal('SIGTERM'))
  process.once('SIGINT', () => onSignal('SIGINT'))
}

/**
 * Opens a collapsible GitHub Actions log group (or a local phase banner).
 * Returns an idempotent closer so early returns still emit `::endgroup::`.
 */
function startLogGroup(name: string): () => void {
  const inActions = process.env.GITHUB_ACTIONS === 'true'
  console.log(inActions ? `::group::${name}` : `\n▸ ${name}`)
  let closed = false
  return () => {
    if (closed) return
    closed = true
    if (inActions) console.log('::endgroup::')
  }
}

/** Visible outside collapsed log groups — shows up in the job Annotations list. */
function logHarnessPhase(phase: string, detail: string): void {
  if (process.env.GITHUB_ACTIONS === 'true') {
    console.log(`::notice title=upstream-sync ${phase}::${detail}`)
  }
  console.log(`[phase] ${phase} — ${detail}`)
}

function ensureActiveDraftPr(options: {
  existingPrNumber: number
  mergeBase: string
  syncBranch: string
  runId: string
  headSha: string
  body: string
  title?: string
}): number {
  const title =
    options.title ?? formatSyncPrTitle({ mergeBase: options.mergeBase, runId: options.runId })

  if (options.existingPrNumber > 0 && isPrOpen(options.existingPrNumber)) {
    try {
      updateDraftPr(options.existingPrNumber, { title, body: options.body })
    } catch (error) {
      console.warn(`Could not update draft PR #${options.existingPrNumber}:`, error)
    }
    return options.existingPrNumber
  }

  const discovered = findOpenSyncPr(options.mergeBase, options.syncBranch)
  if (discovered > 0) {
    try {
      updateDraftPr(discovered, { title, body: options.body })
    } catch (error) {
      console.warn(`Could not update draft PR #${discovered}:`, error)
    }
    return discovered
  }

  try {
    runGit(['push', '-u', 'origin', options.syncBranch])
  } catch (error) {
    throwIfRemotePushAuthError(error, `Push ${options.syncBranch} before opening draft PR`)
    console.warn(`Could not push ${options.syncBranch} before opening draft PR:`, error)
  }

  return createDraftPr(
    options.mergeBase,
    options.syncBranch,
    options.runId,
    options.body,
    options.headSha,
    title
  )
}

async function main(): Promise<void> {
  resetUsageRecords()
  usageFlushCompleted = false
  activeRunId = null
  installUsageFlushHandlers()

  let endGroup = startLogGroup('detect/baseline')
  try {
    ensureUpstreamSyncScaffold()
    ensureNonInteractivePagers()
    assertAgentCredentials()
    ensureSandcastleEnvFile()
    fetchUpstream()

    let initialState = bootstrapStackFromActive(readState())
    const landTarget = baseBranch()
    // Analysis always uses the ultimate land target; PR base may be a stacked sync branch.
    let mergeBase = resolveMergeBase(initialState, RESUME)
    console.log(`Sync land target: ${landTarget} ← simstudioai/sim main`)
    console.log(`PR base (initial): ${mergeBase}`)

    // Resume checks out the sync branch; seed lastSynced from the target branch when missing.
    if (!initialState.lastSyncedUpstreamSha && mergeBase) {
      try {
        const raw = runGit(['show', `origin/${mergeBase}:.upstream-sync/state.json`])
        const fromTarget = JSON.parse(raw) as typeof initialState
        if (fromTarget.lastSyncedUpstreamSha) {
          initialState = {
            ...initialState,
            lastSyncedUpstreamSha: fromTarget.lastSyncedUpstreamSha,
            lastSyncedAt: fromTarget.lastSyncedAt ?? initialState.lastSyncedAt,
          }
          console.log(
            `Seeded lastSyncedUpstreamSha ${fromTarget.lastSyncedUpstreamSha.slice(0, 8)} from origin/${mergeBase}.`
          )
        }
      } catch {
        // Target branch may not have state.json yet.
      }
    }

    const baseline = resolveAnalysisBaseline(landTarget, initialState)
    const tip = resolveCappedUpstreamTip(baseline, {
      activeUpstreamSha: FORCE_RUN ? null : initialState.activeUpstreamSha,
    })
    const runId = todayRunId()
    activeRunId = runId

    if (tip.kind === 'noop' && !RESUME) {
      console.log(`No upstream release to merge (${tip.reason}).`)
      writeRunOutcome(runId, {
        kind: 'noop',
        title: 'Waiting for next upstream release',
        detail: tip.reason,
        mergeBase,
        upstreamSha: initialState.lastSyncedUpstreamSha ?? baseline.upstreamHeadSha,
        commitCount: 0,
      })
      return
    }

    const headSha =
      tip.kind === 'merge'
        ? tip.tipSha
        : (initialState.activeUpstreamSha ?? baseline.upstreamHeadSha)
    const tipReason = tip.kind === 'merge' ? tip.reason : WAITING_FOR_NEXT_RELEASE
    const tipCommitCount = tip.kind === 'merge' ? tip.commitCount : 0
    const tipCapped = tip.kind === 'merge' ? tip.capped : headSha !== baseline.upstreamHeadSha
    // Cap FBI / release-notes / merge range to the resolved tip (default: next release).
    const cappedBaseline = { ...baseline, upstreamHeadSha: headSha }
    const upstreamCommits = commitsSinceBaseline(cappedBaseline)

    console.log(
      `Upstream merge tip ${headSha.slice(0, 8)} (${tipReason}; ${tipCommitCount} commit(s); full HEAD ${baseline.upstreamHeadSha.slice(0, 8)}).`
    )

    appendRunLogSections(runId, {
      'Sync topology': [
        formatBaselineMetadata(cappedBaseline, upstreamCommits.length),
        `- **Merge tip:** ${tipReason} (\`${headSha.slice(0, 8)}\`${
          tipCapped ? `; full upstream HEAD \`${baseline.upstreamHeadSha.slice(0, 8)}\`` : ''
        })`,
      ].join('\n'),
    })

    if (!FORCE_RUN && !RESUME && initialState.lastSyncedUpstreamSha === headSha) {
      console.log(`No upstream changes (already at ${headSha.slice(0, 8)}).`)
      writeRunOutcome(runId, {
        kind: 'noop',
        title: 'No upstream changes',
        detail: `Already synced to ${headSha.slice(0, 8)}.`,
        mergeBase,
        upstreamSha: headSha,
        commitCount: 0,
      })
      return
    }

    if (upstreamCommits.length === 0 && !FORCE_RUN && !RESUME) {
      console.log('No new upstream commits.')
      writeState({ ...initialState, lastSyncedUpstreamSha: headSha, status: 'idle' })
      writeRunOutcome(runId, {
        kind: 'noop',
        title: 'No new upstream commits',
        mergeBase,
        upstreamSha: headSha,
        commitCount: 0,
      })
      return
    }

    let syncBranch: string
    let continuingTip = false
    let workingStack = initialState.stack
    const resuming = RESUME
    if (resuming) {
      syncBranch = resolveResumeSyncBranch(initialState)
      mergeBase = initialState.activeMergeBase ?? landTarget
      workingStack = bootstrapStackFromActive(initialState).stack
    } else {
      let candidateBranch = initialState.activeBranch
      const prOpen = Boolean(initialState.activePrNumber && isPrOpen(initialState.activePrNumber))
      if (!candidateBranch && initialState.activePrNumber && prOpen) {
        candidateBranch = resolvePrHeadBranch(initialState.activePrNumber)
      }

      // Adopt open draft into stack[0] before deciding (e.g. PR #681 predates stack field).
      if (prOpen && candidateBranch) {
        initialState = bootstrapStackFromActive({
          ...initialState,
          activeBranch: candidateBranch,
        })
        workingStack = initialState.stack
      }

      const branchExistsOnRemote = candidateBranch ? remoteBranchExists(candidateBranch) : false
      const decision = decideSyncBranchAction({
        force: FORCE_RUN,
        activePrNumber: initialState.activePrNumber,
        activeBranch: candidateBranch,
        prOpen,
        branchExistsOnRemote,
        tipCompleted: isTipSliceCompleted(initialState),
      })

      if (decision.action === 'continue-tip') {
        syncBranch = decision.branch
        continuingTip = true
        mergeBase = initialState.activeMergeBase ?? landTarget
        console.log(
          `Continuing tip sync PR #${decision.prNumber} on \`${syncBranch}\` (base \`${mergeBase}\`).`
        )
      } else if (decision.action === 'stack-on-tip') {
        mergeBase = decision.tipBranch
        syncBranch = syncBranchName()
        try {
          runGit(['fetch', 'origin', decision.tipBranch])
          runGit(['checkout', decision.tipBranch])
        } catch (error) {
          throw new Error(
            `Could not check out stack tip \`${decision.tipBranch}\` to create the next slice: ${
              error instanceof Error ? error.message : String(error)
            }`
          )
        }
        console.log(
          `Stacking new slice on tip PR #${decision.tipPrNumber} (\`${mergeBase}\`) → \`${syncBranch}\`.`
        )
      } else {
        mergeBase = landTarget
        syncBranch = syncBranchName()
        if (workingStack.length > 0) {
          workingStack = closeOpenStackPrs(workingStack, {
            runId,
            reason: FORCE_RUN ? 'force' : 'fresh-stack',
            newBranch: syncBranch,
            newUpstreamSha: headSha,
          })
          workingStack = []
        } else if (prOpen && initialState.activePrNumber) {
          closeSupersededPr(initialState.activePrNumber, {
            newUpstreamSha: headSha,
            runId,
            newBranch: syncBranch,
            reason: FORCE_RUN ? 'force' : 'fresh-stack',
          })
        }
        try {
          runGit(['fetch', 'origin', landTarget])
          runGit(['checkout', landTarget])
        } catch (error) {
          console.warn(`Could not check out land target ${landTarget} before fresh branch:`, error)
        }
        console.log(`Starting fresh sync stack \`${syncBranch}\` (${decision.reason}).`)
      }
    }

    checkoutSyncBranch(syncBranch, resuming || continuingTip)

    if (resuming || listConflictFiles().length > 0) {
      if (!ensureInstallableWorkspace(runId)) {
        appendRunLogSections(runId, {
          Status: 'blocked',
          'Package bootstrap':
            'Could not regenerate bun.lock while resuming. Resolve package.json conflicts manually, then resume.',
        })
        writeState({ ...readState(), status: 'awaiting_input' })
        writeRunOutcome(runId, {
          kind: 'awaiting_input',
          title: 'Package bootstrap failed while resuming',
          detail:
            'Could not regenerate bun.lock. Resolve package.json conflicts manually, then resume.',
          syncBranch,
          mergeBase,
          upstreamSha: headSha,
          prNumber: initialState.activePrNumber,
          commitCount: upstreamCommits.length,
        })
        process.exitCode = 1
        return
      }
      try {
        runGit(['push', 'origin', syncBranch])
      } catch (error) {
        throwIfRemotePushAuthError(error, `Push bootstrapped ${syncBranch}`)
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
      const ledgerRunId = branchState.lastRunId ?? runId
      const ingested = ingestGrillQaFromPr(activePrNumber, ledgerRunId, workingState)
      workingState = ingested.state
      if (ingested.added > 0) {
        console.log(`Synced ${ingested.added} grill Q&A comment(s) from PR #${activePrNumber}.`)
      }
      // ingest clears ledgerRunId when answered; also clear today's slot on cross-day resume.
      if (runId !== ledgerRunId && !hasUnansweredGrillQuestions({ runId: ledgerRunId })) {
        clearOpenQuestionsFile(runId)
      }
      commitUpstreamLedger(`upstream-sync(${ledgerRunId}): log resume Q&A`)
    }

    writeState({
      ...workingState,
      status: 'running',
      lastRunId: runId,
      activeBranch: syncBranch,
      activeMergeBase: mergeBase,
      activePrNumber: activePrNumber || null,
      activeUpstreamSha: headSha,
      stack: workingStack,
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

    const releaseVersion =
      tip.kind === 'merge' && tip.version ? tip.version : (releaseEntries[0]?.version ?? null)
    const { owner, repo } = repoSlug()
    const repository = `${owner}/${repo}`

    const syncPrTitle = formatSyncPrTitle({
      mergeBase,
      runId,
      releaseVersion,
    })

    endGroup()
    endGroup = startLogGroup('draft PR')

    const stackPreview = upsertStackTip(workingStack, {
      runId,
      releaseVersion,
      upstreamSha: headSha,
      branch: syncBranch,
      prNumber: activePrNumber || 0,
      status: 'open',
    })

    const earlyPrBody = [
      QUESTION_MARKER,
      `## Upstream sync in progress — grill/analysis phase (${runId})`,
      '',
      `Branch \`${syncBranch}\` · merging [\`simstudioai/sim@${headSha.slice(0, 8)}\`](https://github.com/simstudioai/sim/commit/${headSha}) into \`${mergeBase}\`.`,
      '',
      `**Sync range:** ${upstreamCommits.length} commit(s) since \`${baseline.baselineSha.slice(0, 8)}\` (${baseline.baselineSource}).`,
      '',
      formatStackTableMarkdown(stackPreview, {
        repository,
        highlightPrNumber: activePrNumber || null,
      }),
      '',
      'The parent grill agent will post questions here. Reply with `/upstream-sync resume` after answering.',
      '',
      `### Ledger (in progress)`,
      `- [.upstream-sync/ledger/${runId}/run.md](.upstream-sync/ledger/${runId}/run.md)`,
      `- [.upstream-sync/ledger/${runId}/fbi-report.md](.upstream-sync/ledger/${runId}/fbi-report.md)`,
      `- [.upstream-sync/ledger/${runId}/release-notes.md](.upstream-sync/ledger/${runId}/release-notes.md)`,
    ].join('\n')

    activePrNumber = ensureActiveDraftPr({
      existingPrNumber: continuingTip || resuming ? activePrNumber : 0,
      mergeBase,
      syncBranch,
      runId,
      headSha,
      body: earlyPrBody,
      title: syncPrTitle,
    })

    workingStack = upsertStackTip(workingStack, {
      runId,
      releaseVersion,
      upstreamSha: headSha,
      branch: syncBranch,
      prNumber: activePrNumber || 0,
      status: 'open',
    })

    persistActiveSyncState({
      runId,
      syncBranch,
      mergeBase,
      activePrNumber: activePrNumber || null,
      activeUpstreamSha: headSha,
      stack: workingStack,
    })

    endGroup()
    endGroup = startLogGroup('grill')

    const agents = resolveAgents()
    const skipParentGrill = shouldSkipParentGrill({ resume: RESUME, prNumber: activePrNumber })

    if (skipParentGrill) {
      console.log(
        `Skipping parent grill re-ask — resume answer found on PR #${activePrNumber}. Finalize plan runs after merge.`
      )
      appendRunLogSections(runId, {
        'Grill analysis':
          'Skipped re-ask on resume. Human answers were recorded in `grill-log.md` / `qa-history.jsonl`. Parent finalize still runs after merge.',
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
        AGENT_MODE: agents.provider,
        PARENT_MODEL: agents.parentModel,
        CHILD_MODEL: agents.childModel,
      })

      console.log(
        `[agents] mode=${agents.provider} parent=${agents.parentModel} child=${agents.childModel}`
      )

      await runAgentPrompt({
        prompt: parentPrompt,
        name: 'parent-grill-analysis',
        branch: syncBranch,
        runId,
        agent: agents.parent,
        agentKind: 'parent',
        agents,
        maxIterations: 1,
        completionSignal: GRILL_COMPLETION_SIGNAL,
      })

      recordParentPlanFromDraft(runId)
      commitUpstreamLedger(`upstream-sync(${runId}): grill analysis`)
    } else {
      console.log('[skip-agent] parent-grill-analysis')
      recordParentPlanFromDraft(runId)
    }

    // Grill may leave product questions in open-questions.md — never merge until answered.
    if (activePrNumber > 0) {
      syncGrillQaFromPr(activePrNumber, runId)
    }
    const priorRunId = workingState.lastRunId
    const unanswered =
      hasUnansweredGrillQuestions({ runId }) ||
      (Boolean(priorRunId) &&
        priorRunId !== runId &&
        hasUnansweredGrillQuestions({ runId: priorRunId as string }))
    if (unanswered) {
      const questionsRunId =
        priorRunId && hasUnansweredGrillQuestions({ runId: priorRunId }) ? priorRunId : runId
      const usageSectionQuestions = appendUsageToRunLog(runId)
      appendRunLogSections(runId, {
        Status: 'awaiting_input',
        'Open questions':
          'Grill left unanswered product decisions in `open-questions.md`. Merge will not start until `/upstream-sync resume`.',
      })
      const questionsBody = [
        QUESTION_MARKER,
        `## Upstream sync awaiting answers (${runId})`,
        '',
        'Grill analysis found product decisions that need a human call before merge starts.',
        '',
        `See [.upstream-sync/ledger/${questionsRunId}/open-questions.md](.upstream-sync/ledger/${questionsRunId}/open-questions.md).`,
        '',
        `Reply with \`${RESUME_COMMAND}\` and your answers on this PR.`,
        '',
        '### Agent usage',
        usageSectionQuestions,
      ].join('\n')
      const prNumber = ensureActiveDraftPr({
        existingPrNumber: activePrNumber,
        mergeBase,
        syncBranch,
        runId,
        headSha,
        title: syncPrTitle,
        body: [
          questionsBody,
          '',
          formatStackTableMarkdown(workingStack, {
            repository,
            highlightPrNumber: activePrNumber || null,
          }),
        ].join('\n'),
      })
      logHarnessQuestion(
        runId,
        prNumber,
        'Grill open questions must be answered before merge starts.',
        `.upstream-sync/ledger/${questionsRunId}/open-questions.md`
      )
      if (prNumber > 0) syncGrillQaFromPr(prNumber, runId)
      commitUpstreamLedger(`upstream-sync(${runId}): await grill answers`)
      try {
        runGit(['push', 'origin', syncBranch])
      } catch (error) {
        throwIfRemotePushAuthError(error, `Push ${syncBranch} after grill gate`)
        console.warn(`Could not push ${syncBranch} after grill gate:`, error)
      }
      writeState({ ...readState(), activePrNumber: prNumber || null, status: 'awaiting_input' })
      writeRunOutcome(runId, {
        kind: 'awaiting_input',
        title: 'Awaiting grill answers before merge',
        detail: `Answer questions in \`.upstream-sync/ledger/${questionsRunId}/open-questions.md\` and reply with ${RESUME_COMMAND}.`,
        syncBranch,
        mergeBase,
        upstreamSha: headSha,
        prNumber: prNumber || null,
        commitCount: upstreamCommits.length,
      })
      process.exitCode = 1
      return
    }

    endGroup()
    endGroup = startLogGroup('merge/bootstrap')

    try {
      // Merge the resolved tip (next release, until_sha, or max_commits) — not always upstream/main HEAD.
      runGit(['merge', '--no-edit', headSha])
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
        title: syncPrTitle,
        body: (() => {
          const body = [
            QUESTION_MARKER,
            `## Upstream sync blocked (${runId})`,
            '',
            'Package manager bootstrap failed — bun.lock still has merge conflict markers.',
            '',
            `Reply with \`${RESUME_COMMAND}\` after fixing manifests manually.`,
          ].join('\n')
          return body
        })(),
      })
      writeState({
        ...readState(),
        activePrNumber: prNumber || null,
        status: 'awaiting_input',
        stack: workingStack,
      })
      writeRunOutcome(runId, {
        kind: 'awaiting_input',
        title: 'Package bootstrap failed after merge',
        detail: 'bun.lock still has merge conflict markers. Fix manifests manually, then resume.',
        syncBranch,
        mergeBase,
        upstreamSha: headSha,
        prNumber: prNumber || null,
        commitCount: upstreamCommits.length,
        remainingConflicts: listConflictFiles(),
      })
      process.exitCode = 1
      return
    }

    // Re-apply prior mid-merge resolutions from the WIP sidecar (resume / crashed runs).
    const conflictSnapshot = listConflictFiles()
    restoreWipLedger(syncBranch)
    let decisionHash = computeRunDecisionHash(runId)
    const wipResult = applyMergeWip({
      syncBranch,
      expectedDecisionHash: decisionHash,
      runId,
    })
    if (wipResult.skipped) {
      console.log(
        `[wip] overlay skipped (${wipResult.reason ?? 'unknown'}); leaving conflicts for finalize/agents`
      )
    } else {
      console.log(
        `[wip] overlay applied=${wipResult.applied} deleted=${wipResult.deleted} (hash ${decisionHash.slice(0, 12)})`
      )
    }

    try {
      runGit(['push', 'origin', syncBranch])
    } catch (error) {
      throwIfRemotePushAuthError(error, `Push ${syncBranch} after package bootstrap`)
      console.warn(`Could not push ${syncBranch} after package bootstrap:`, error)
    }

    endGroup()
    endGroup = startLogGroup('parent finalize')

    if (!SKIP_AGENT) {
      await runParentFinalizePlan({
        runId,
        syncBranch,
        upstreamSha: headSha,
        activePrNumber,
        agents,
        wipOverlayStatus: wipResult.skipped
          ? `skipped (${wipResult.reason ?? 'unknown'}) — conflicts left as-is`
          : `applied=${wipResult.applied} deleted=${wipResult.deleted}`,
      })
    } else {
      console.log('[skip-agent] parent-finalize-plan')
    }

    const finalPlan = readMergePlanFinal(runId)
    const directives = loadFinalDirectives(runId)
    if (!finalPlan || !directives) {
      console.warn(
        '[merge-plan] Finalize did not write merge-plan.json / merge-directives.json — falling back to empty directives and prefix clustering if needed.'
      )
    } else {
      appendRunLogSections(runId, { 'Parent plan': formatParentPlanSummary(finalPlan) })
    }

    const lockedDirectives = directives ?? emptyMergeDirectives()
    const restricted = restrictMergeDirectivesToUnmerged(lockedDirectives, listConflictFiles())
    if (restricted.dropped.length > 0) {
      console.log(
        `[merge-directives] dropped ${restricted.dropped.length} already-resolved path(s) from finalize directives`
      )
    }
    decisionHash = computeDecisionHashFromDisk({
      directives: lockedDirectives,
      grillAnswerIds: collectGrillAnswerIds(),
    })

    const directiveResult = applyMergeDirectives(restricted.directives)
    if (
      directiveResult.deleted.length +
        directiveResult.checkoutOurs.length +
        directiveResult.checkoutTheirs.length +
        directiveResult.failed.length +
        restricted.dropped.length >
      0
    ) {
      console.log(
        `[merge-directives] ours=${directiveResult.checkoutOurs.length} theirs=${directiveResult.checkoutTheirs.length} delete=${directiveResult.deleted.length} failed=${directiveResult.failed.length}`
      )
      appendRunLogSections(runId, {
        'Merge directives': [
          lockedDirectives.notes || '_No directive notes._',
          '',
          `- checkoutOurs: ${directiveResult.checkoutOurs.length}`,
          `- checkoutTheirs: ${directiveResult.checkoutTheirs.length}`,
          `- delete: ${directiveResult.deleted.length}`,
          `- failed: ${directiveResult.failed.length}`,
          lockedDirectives.mustEdit.length
            ? `- mustEdit: ${lockedDirectives.mustEdit.map((path) => `\`${path}\``).join(', ')}`
            : '',
          lockedDirectives.overrideForkFirst.length
            ? `- overrideForkFirst: ${lockedDirectives.overrideForkFirst.map((path) => `\`${path}\``).join(', ')}`
            : '',
          restricted.dropped.length
            ? `- skipped already-resolved: ${restricted.dropped.map((path) => `\`${path}\``).join(', ')}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      })
    }

    persistMergeWip({
      syncBranch,
      runId,
      clusterId: 'parent-finalize',
      conflictSnapshot,
      decisionHash,
    })

    endGroup()
    endGroup = startLogGroup('child clusters')

    const conflictsBeforePolicy = listConflictFiles()
    const policy = resolveDeterministicPolicyConflicts(conflictsBeforePolicy, {
      overrideForkFirst: lockedDirectives.overrideForkFirst,
      mustEdit: lockedDirectives.mustEdit,
    })
    if (policy.resolved.length > 0) {
      console.log(
        `[policy-resolve] Deterministically resolved ${policy.resolved.length} path(s); ${policy.remaining.length} remain for agents.`
      )
      persistMergeWip({
        syncBranch,
        runId,
        clusterId: 'policy-deterministic',
        conflictSnapshot,
        decisionHash,
      })
    }

    const conflicts = listConflictFiles()
    const plannedClusters = clustersFromMergePlan(finalPlan, conflicts)
    const clusters = plannedClusters ?? groupConflictClusters(conflicts)
    const clusterSource = plannedClusters ? 'merge-plan' : 'fallback-prefix'
    writeClusterManifest(runId, clusters)
    const leaves = leafConflictClusters(clusters)
    const allNodes = walkConflictClusters(clusters)
    console.log(
      `[cluster] source=${clusterSource} forest: ${clusters.length} root(s), ${allNodes.length} node(s), ${leaves.length} leaf(ves), ${conflicts.length} file(s)`
    )

    try {
      await runConflictClusterForest({
        roots: clusters,
        runId,
        syncBranch,
        activePrNumber,
        agents,
        conflictSnapshot,
        decisionHash,
      })
    } catch (error) {
      persistMergeWip({
        syncBranch,
        runId,
        clusterId: 'capacity-or-error',
        conflictSnapshot,
        decisionHash,
      })
      if (isTransientModelCapacityError(error)) {
        const usageSectionBlocked = appendUsageToRunLog(runId)
        appendRunLogSections(runId, {
          Status: 'blocked',
          'Capacity exhaustion': getErrorMessage(error),
          'Remaining conflicts': listConflictFiles()
            .map((file) => `- ${file}`)
            .join('\n'),
        })
        const prBody = [
          QUESTION_MARKER,
          `## Upstream sync blocked (${runId})`,
          '',
          'Model capacity was exhausted while resolving conflict clusters. WIP was persisted; resume after capacity recovers.',
          '',
          `Remaining conflicts: ${listConflictFiles().length}.`,
          '',
          `Reply with \`${RESUME_COMMAND}\` to continue.`,
          '',
          '### Agent usage',
          usageSectionBlocked,
        ].join('\n')
        const prNumber = resolveDraftPr(
          activePrNumber,
          mergeBase,
          syncBranch,
          runId,
          prBody,
          headSha,
          syncPrTitle
        )
        writeState({
          ...readState(),
          activePrNumber: prNumber || null,
          status: 'blocked',
          stack: workingStack,
        })
        writeRunOutcome(runId, {
          kind: 'blocked',
          title: 'Blocked on model capacity during cluster resolution',
          detail: getErrorMessage(error),
          syncBranch,
          mergeBase,
          upstreamSha: headSha,
          prNumber: prNumber || null,
          commitCount: upstreamCommits.length,
          remainingConflicts: listConflictFiles(),
        })
        process.exitCode = 1
        return
      }
      throw error
    }

    let remaining = listConflictFiles()
    if (!SKIP_AGENT) {
      const finalizeDetail =
        remaining.length > 0
          ? `${remaining.length} conflict(s) left after clusters — running finalize/coherence agent.`
          : 'Conflicts clear — running always-on finalize/coherence agent.'
      console.log(finalizeDetail)
      logHarnessPhase('finalize', finalizeDetail)
      remaining = await runFinalizeMergeAgent({
        runId,
        syncBranch,
        activePrNumber,
        agents,
        remaining,
        reason:
          remaining.length > 0
            ? 'Cluster agents finished but unmerged paths remain. Resolve every leftover conflict, then run the coherence checklist.'
            : COHERENCE_REASON,
      })
      persistMergeWip({
        syncBranch,
        runId,
        clusterId: 'finalize-after-clusters',
        conflictSnapshot,
        decisionHash,
      })
      stageMergePolicyIfPresent()
    }

    if (remaining.length > 0) {
      persistMergeWip({
        syncBranch,
        runId,
        clusterId: 'blocked-final',
        conflictSnapshot,
        decisionHash,
      })
      const usageSectionBlocked = appendUsageToRunLog(runId)
      appendRunLogSections(runId, {
        Status: 'blocked',
        'Remaining conflicts': remaining.map((f) => `- ${f}`).join('\n'),
      })

      const prBody = [
        QUESTION_MARKER,
        `## Upstream sync blocked (${runId})`,
        '',
        `${remaining.length} unresolved conflict(s) after finalize agent. Review ledger at \`.upstream-sync/ledger/${runId}/\`.`,
        '',
        `Reply with \`${RESUME_COMMAND}\` after answering open questions.`,
        '',
        '### Agent usage',
        usageSectionBlocked,
      ].join('\n')

      const prNumber = resolveDraftPr(
        activePrNumber,
        mergeBase,
        syncBranch,
        runId,
        prBody,
        headSha,
        syncPrTitle
      )
      logHarnessQuestion(
        runId,
        prNumber,
        `${remaining.length} unresolved merge conflict(s). Review ledger and reply with ${RESUME_COMMAND}.`,
        remaining.join(', ')
      )
      if (prNumber > 0) syncGrillQaFromPr(prNumber, runId)
      commitUpstreamLedger(`upstream-sync(${runId}): log grill Q&A`)
      writeState({
        ...readState(),
        activePrNumber: prNumber || null,
        status: 'awaiting_input',
        stack: workingStack,
      })
      writeRunOutcome(runId, {
        kind: 'awaiting_input',
        title: `${remaining.length} unresolved merge conflict(s)`,
        detail: `Review ledger at \`.upstream-sync/ledger/${runId}/\` and reply with ${RESUME_COMMAND}.`,
        syncBranch,
        mergeBase,
        upstreamSha: headSha,
        prNumber: prNumber || null,
        commitCount: upstreamCommits.length,
        remainingConflicts: remaining,
      })
      process.exitCode = 1
      return
    }

    logHarnessPhase('merge-commit', 'Conflicts cleared — creating merge commit')
    runGit(['add', '-A'])
    if (hasStagedChanges()) {
      try {
        commitHarness(`upstream-sync(${runId}): merge simstudioai/sim main`)
      } catch (error) {
        const commitError = getErrorMessage(error)
        console.warn('Merge commit failed — invoking finalize child agent once.', commitError)
        remaining = await runFinalizeMergeAgent({
          runId,
          syncBranch,
          activePrNumber,
          agents,
          remaining: listConflictFiles(),
          reason:
            'The harness merge commit failed (often leftover unmerged paths or a broken hybrid). Fix the tree so `git commit` can succeed. Do not run husky/lint-staged.',
          commitError,
        })
        persistMergeWip({
          syncBranch,
          runId,
          clusterId: 'finalize-after-commit-fail',
          conflictSnapshot,
          decisionHash,
        })

        if (remaining.length > 0) {
          const usageSectionBlocked = appendUsageToRunLog(runId)
          appendRunLogSections(runId, {
            Status: 'blocked',
            'Remaining conflicts': remaining.map((f) => `- ${f}`).join('\n'),
            'Commit error': commitError.slice(0, 2000),
          })
          const prBody = [
            QUESTION_MARKER,
            `## Upstream sync blocked (${runId})`,
            '',
            `${remaining.length} unresolved conflict(s) after finalize agent (commit failed).`,
            '',
            `Reply with \`${RESUME_COMMAND}\` after fixing remaining paths.`,
            '',
            '### Agent usage',
            usageSectionBlocked,
          ].join('\n')
          const prNumber = resolveDraftPr(
            activePrNumber,
            mergeBase,
            syncBranch,
            runId,
            prBody,
            headSha,
            syncPrTitle
          )
          writeState({
            ...readState(),
            activePrNumber: prNumber || null,
            status: 'awaiting_input',
            stack: workingStack,
          })
          writeRunOutcome(runId, {
            kind: 'awaiting_input',
            title: `${remaining.length} unresolved merge conflict(s) after commit failure`,
            detail: commitError.slice(0, 500),
            syncBranch,
            mergeBase,
            upstreamSha: headSha,
            prNumber: prNumber || null,
            commitCount: upstreamCommits.length,
            remainingConflicts: remaining,
          })
          process.exitCode = 1
          return
        }

        runGit(['add', '-A'])
        if (hasStagedChanges()) {
          commitHarness(`upstream-sync(${runId}): merge simstudioai/sim main`)
        }
      }
    }

    endGroup()
    logHarnessPhase(
      'verify',
      'format + advisory check / lint / test (full build left to CI; streamed; heartbeats every 60s)'
    )
    endGroup = startLogGroup('verify')

    const formatResult = autofixFormat()
    if (formatResult.success) {
      runGit(['add', '-A'])
      if (hasStagedChanges()) {
        commitHarness(`upstream-sync(${runId}): format after merge`)
      }
    } else {
      console.warn('[verify] bun run format failed — continuing to verification anyway')
      console.warn(formatResult.output.slice(0, 2000))
    }

    const verifyResults = runVerification()
    const verifyPassed = allVerificationPassed(verifyResults)
    const blockingPassed = allBlockingVerificationPassed(verifyResults)
    appendRunLogSections(runId, {
      Format: formatResult.success
        ? '✅ `bun run format` (pre-verify autofix)'
        : `❌ \`bun run format\` failed\n\n\`\`\`\n${formatResult.output.slice(0, 2000)}\n\`\`\``,
      Verification: formatVerifyResults(verifyResults),
      'Merge policy': readFileSync(MERGE_POLICY_PATH, 'utf8').slice(0, 2000),
    })

    if (!blockingPassed) {
      console.warn(
        '[verify] Unexpected blocking verification failure with no configured blocking steps — completing with advisory warnings.'
      )
    }

    if (!verifyPassed) {
      console.warn(
        '[verify] Advisory check/lint/test failed — completing anyway (full bun run build is left to CI).'
      )
    }

    endGroup()
    endGroup = startLogGroup('finalize/usage')

    appendExtensibilityNote(
      runId,
      '- Consider moving fork registry entries to sidecar import files to reduce registry.ts merge conflicts.'
    )

    runGit(['add', '.upstream-sync'])
    if (hasStagedChanges()) {
      commitHarness(`upstream-sync(${runId}): update ledger`)
    }

    const usageSectionFinal = appendUsageToRunLog(runId, workingStack)
    workingStack = upsertStackTip(workingStack, {
      runId,
      releaseVersion,
      upstreamSha: headSha,
      branch: syncBranch,
      prNumber: activePrNumber || 0,
      status: 'open',
    })
    const prBody = [
      `## Upstream sync — ${runId}`,
      '',
      `Merges [\`simstudioai/sim@${headSha.slice(0, 8)}\`](https://github.com/simstudioai/sim/commit/${headSha}) into \`${mergeBase}\`.`,
      '',
      `**Sync range:** ${upstreamCommits.length} commit(s) since \`${baseline.baselineSha.slice(0, 8)}\` (${baseline.baselineSource}).`,
      '',
      formatStackTableMarkdown(workingStack, {
        repository,
        highlightPrNumber: activePrNumber || null,
      }),
      '',
      `### Ledger`,
      `- [.upstream-sync/ledger/${runId}/run.md](.upstream-sync/ledger/${runId}/run.md)`,
      `- [.upstream-sync/ledger/${runId}/fbi-report.md](.upstream-sync/ledger/${runId}/fbi-report.md)`,
      `- [.upstream-sync/ledger/${runId}/release-notes.md](.upstream-sync/ledger/${runId}/release-notes.md) — **all upstream release notes since last sync**`,
      `- [.upstream-sync/ledger/${runId}/grill-qa.md](.upstream-sync/ledger/${runId}/grill-qa.md) — **grill Q&A for this run**`,
      `- [.upstream-sync/grill-log.md](.upstream-sync/grill-log.md) — **rolling grill Q&A across all runs**`,
      `- [.upstream-sync/ledger/${runId}/skipped.md](.upstream-sync/ledger/${runId}/skipped.md) — **upstream changes we declined**`,
      `- [.upstream-sync/ledger/${runId}/merge-plan.json](.upstream-sync/ledger/${runId}/merge-plan.json) — **final parent plan**`,
      `- [.upstream-sync/ledger/${runId}/stack-usage.json](.upstream-sync/ledger/${runId}/stack-usage.json) — **stack usage rollup**`,
      '',
      '### Verification',
      formatVerifyStatusLine(verifyResults),
      '',
      '_Check / lint / test are advisory. Full build is left to CI._',
      '',
      formatVerifyResults(verifyResults),
      '',
      '### Agent usage',
      usageSectionFinal,
      '',
      '**Draft** — tip-only landing: merge this tip into the target branch, then close lower stack PRs as superseded.',
    ].join('\n')

    const prNumber = resolveDraftPr(
      activePrNumber,
      mergeBase,
      syncBranch,
      runId,
      prBody,
      headSha,
      syncPrTitle
    )
    if (prNumber > 0) syncGrillQaFromPr(prNumber, runId)
    workingStack = upsertStackTip(workingStack, {
      runId,
      releaseVersion,
      upstreamSha: headSha,
      branch: syncBranch,
      prNumber: prNumber || 0,
      status: 'open',
    })
    commitUpstreamLedger(`upstream-sync(${runId}): log grill Q&A`)
    runGit(['push', 'origin', syncBranch])

    writeState({
      lastSyncedUpstreamSha: headSha,
      lastSyncedAt: new Date().toISOString(),
      lastRunId: runId,
      status: 'completed',
      openQuestions: [],
      activeBranch: syncBranch,
      activePrNumber: prNumber,
      activeMergeBase: mergeBase,
      activeUpstreamSha: null,
      stack: workingStack,
    })

    maybeDispatchNextReleaseSlice({
      syncedSha: headSha,
      upstreamHeadSha: baseline.upstreamHeadSha,
      tipReason,
    })

    writeRunOutcome(runId, {
      kind: 'completed',
      title: verifyPassed
        ? 'Upstream sync completed'
        : 'Upstream sync completed (advisory verification warnings)',
      detail: verifyPassed
        ? `Merged simstudioai/sim@${headSha.slice(0, 8)} into \`${mergeBase}\` (${upstreamCommits.length} commit(s)). Draft PR ready for review. Full build is left to CI.`
        : `Merged simstudioai/sim@${headSha.slice(0, 8)} into \`${mergeBase}\` (${upstreamCommits.length} commit(s)). Advisory check/lint/test reported failures — see ledger / PR / job summary. Full build is left to CI.`,
      syncBranch,
      mergeBase,
      upstreamSha: headSha,
      prNumber: prNumber || null,
      commitCount: upstreamCommits.length,
      verification: verificationToOutcome(verifyResults),
    })

    console.log(`Upstream sync complete. Draft PR #${prNumber} on ${syncBranch}.`)
  } finally {
    endGroup()
  }
}

main().catch((error) => {
  console.error(error)
  flushUsageBestEffort('harness-error')
  try {
    const runId = activeRunId ?? readState().lastRunId ?? todayRunId()
    const state = readState()
    writeRunOutcome(runId, {
      kind: 'failed',
      title: 'Harness error',
      detail: 'The upstream-sync harness threw before finishing.',
      syncBranch: state.activeBranch,
      mergeBase: state.activeMergeBase,
      upstreamSha: state.lastSyncedUpstreamSha,
      prNumber: state.activePrNumber,
      remainingConflicts: (() => {
        try {
          return listConflictFiles()
        } catch {
          return []
        }
      })(),
      errorMessage: error instanceof Error ? (error.stack ?? error.message) : String(error),
    })
    writeState({ ...state, status: 'failed' })
  } catch {
    // state file may not exist if bootstrap failed early
  }
  process.exitCode = 1
})

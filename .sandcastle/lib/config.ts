import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const UPSTREAM_SYNC_ROOT = '.upstream-sync'
export const LEDGER_DIR = join(UPSTREAM_SYNC_ROOT, 'ledger')
export const STATE_PATH = join(UPSTREAM_SYNC_ROOT, 'state.json')
export const QA_HISTORY_PATH = join(UPSTREAM_SYNC_ROOT, 'qa-history.jsonl')
export const GRILL_LOG_PATH = join(UPSTREAM_SYNC_ROOT, 'grill-log.md')
export const MERGE_POLICY_PATH = join(UPSTREAM_SYNC_ROOT, 'merge-policy.json')
export const EXTENSIBILITY_PATH = join(UPSTREAM_SYNC_ROOT, 'extensibility-notes.md')
export const SYNC_BRANCH_README_PATH = join(UPSTREAM_SYNC_ROOT, 'SYNC-BRANCH.md')

export const COMPLETION_SIGNAL = '<promise>UPSTREAM_SYNC_COMPLETE</promise>'
export const GRILL_COMPLETION_SIGNAL = '<promise>UPSTREAM_SYNC_GRILL_COMPLETE</promise>'
export const QUESTION_MARKER = '<!-- upstream-sync-question -->'
export const RESUME_COMMAND = '/upstream-sync resume'

export const VERIFY_COMMANDS = ['bun run check', 'bun run lint', 'bun run test', 'bun run build'] as const

export interface SyncState {
  lastSyncedUpstreamSha: string | null
  lastSyncedAt: string | null
  lastRunId: string | null
  status: 'idle' | 'running' | 'awaiting_input' | 'completed' | 'failed'
  openQuestions: Array<{ id: string; question: string; context?: string }>
  activeBranch: string | null
  activePrNumber: number | null
  activeMergeBase: string | null
}

export interface UpstreamCommit {
  sha: string
  date: string
  title: string
  prNumber: number | null
}

export interface ConflictCluster {
  id: string
  prefix: string
  files: string[]
}

export interface GrillQaEntry {
  id: string
  runId: string
  prNumber?: number | null
  question?: string
  answer?: string
  context?: string
  askedAt?: string
  answeredAt?: string
  askedBy?: string
  answeredBy?: string
  source: 'pr-comment' | 'harness' | 'resume'
  sourceCommentId?: number
}

export function ensureGrillLogExists(): void {
  try {
    readFileSync(GRILL_LOG_PATH, 'utf8')
  } catch {
    writeFileSync(
      GRILL_LOG_PATH,
      '# Upstream Sync — Grill Q&A Log\n\nRolling log of questions asked on sync PRs and human answers. Agents read this (and `qa-history.jsonl`) before asking again.\n'
    )
  }
}

export function readLoggedCommentIds(): Set<number> {
  const ids = new Set<number>()
  try {
    const lines = readFileSync(QA_HISTORY_PATH, 'utf8').split('\n').filter(Boolean)
    for (const line of lines) {
      const entry = JSON.parse(line) as GrillQaEntry
      if (entry.sourceCommentId) ids.add(entry.sourceCommentId)
    }
  } catch {
    /* empty log */
  }
  return ids
}

export function appendGrillQa(entry: GrillQaEntry): void {
  ensureGrillLogExists()
  appendQaHistory(entry as unknown as Record<string, unknown>)

  const runLine = [`## ${entry.runId}`, entry.prNumber ? `PR #${entry.prNumber}` : null]
    .filter(Boolean)
    .join(' · ')

  const parts: string[] = [runLine, '']
  if (entry.question) {
    parts.push(
      `**Q** (${entry.askedAt ?? 'unknown'}${entry.askedBy ? `, ${entry.askedBy}` : ''}): ${entry.question.trim()}`
    )
    if (entry.context) parts.push(`_Context: ${entry.context}_`)
    parts.push('')
  }
  if (entry.answer) {
    parts.push(
      `**A** (${entry.answeredAt ?? 'unknown'}${entry.answeredBy ? `, ${entry.answeredBy}` : ''}): ${entry.answer.trim()}`
    )
    parts.push('')
  }

  writeFileSync(GRILL_LOG_PATH, `${readFileSync(GRILL_LOG_PATH, 'utf8').trim()}\n\n${parts.join('\n')}\n`)

  const runGrillPath = join(ensureLedgerRunDir(entry.runId), 'grill-qa.md')
  const existing = (() => {
    try {
      return readFileSync(runGrillPath, 'utf8')
    } catch {
      return `# Grill Q&A — ${entry.runId}\n`
    }
  })()
  writeFileSync(runGrillPath, `${existing.trim()}\n\n${parts.join('\n')}\n`)
}

export function repoSlug(): { owner: string; repo: string } {
  const slug =
    process.env.GITHUB_REPOSITORY ??
    runGh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
  const [owner, repo] = slug.split('/')
  return { owner, repo }
}

export function comparePullRequestUrl(mergeBase: string, branch: string): string {
  const { owner, repo } = repoSlug()
  const base = encodeURIComponent(mergeBase).replace(/%2F/g, '/')
  const head = encodeURIComponent(branch).replace(/%2F/g, '/')
  return `https://github.com/${owner}/${repo}/compare/${base}...${head}?expand=1`
}

/** Actionable hint when `gh pr create` fails — usually not an auth issue. */
export function explainPrCreateFailure(
  error: unknown,
  mergeBase: string,
  branch: string
): string {
  const message = error instanceof Error ? error.message : String(error)

  if (isSyncBranch(mergeBase)) {
    return [
      `Invalid PR base "${mergeBase}" — sync branches cannot be merge targets.`,
      `Set TARGET_BRANCH to the fork branch (e.g. feat/github-merge-agent).`,
      'This often happens when a push to upstream-sync/* re-triggers the workflow.',
    ].join(' ')
  }

  if (message.includes('No commits between')) {
    return [
      `No commits between base "${mergeBase}" and head "${branch}" on the remote.`,
      'Ensure the sync branch is pushed and has commits ahead of the base branch.',
    ].join(' ')
  }

  if (message.includes('Head ref must be a branch') || message.includes("Head sha can't be blank")) {
    return [
      `Head branch "${branch}" was not found on GitHub after push.`,
      'Confirm `git push -u origin` succeeded and the branch name has no remote/ prefix.',
    ].join(' ')
  }

  if (message.includes('Base ref must be a branch') || message.includes("Base sha can't be blank")) {
    return [
      `Base branch "${mergeBase}" was not found on GitHub.`,
      'Push the target branch to origin or set TARGET_BRANCH to an existing remote branch.',
    ].join(' ')
  }

  if (message.includes('403') || message.includes('Resource not accessible')) {
    return 'GitHub API denied PR creation — set GH_PAT (classic ghp_* token with repo scope) on the fork.'
  }

  return message
}

interface PrComment {
  id: number
  body: string
  created_at: string
  user: { login: string }
}

/**
 * Pull new question comments from the sync PR into grill-log.md and qa-history.jsonl.
 */
export function syncGrillQaFromPr(prNumber: number, runId: string): number {
  const { owner, repo } = repoSlug()
  const raw = runGh([
    'api',
    `repos/${owner}/${repo}/issues/${prNumber}/comments`,
    '--paginate',
  ])
  const comments = JSON.parse(raw) as PrComment[]
  const logged = readLoggedCommentIds()
  let added = 0

  for (const comment of comments) {
    if (logged.has(comment.id)) continue
    const isQuestion = comment.body.includes(QUESTION_MARKER)
    const isResume =
      comment.body.includes(RESUME_COMMAND) && !comment.user.login.includes('[bot]')

    if (isQuestion) {
      const question = comment.body
        .replace(QUESTION_MARKER, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .trim()
      appendGrillQa({
        id: `q-${comment.id}`,
        runId,
        prNumber,
        question,
        askedAt: comment.created_at,
        askedBy: comment.user.login,
        source: 'pr-comment',
        sourceCommentId: comment.id,
      })
      added++
      continue
    }

    if (isResume) {
      appendGrillQa({
        id: `a-${comment.id}`,
        runId,
        prNumber,
        answer: comment.body.trim(),
        answeredAt: comment.created_at,
        answeredBy: comment.user.login,
        source: 'resume',
        sourceCommentId: comment.id,
      })
      added++
    }
  }

  return added
}

export function logHarnessQuestion(
  runId: string,
  prNumber: number,
  question: string,
  context?: string
): void {
  appendGrillQa({
    id: `harness-${runId}-${Date.now()}`,
    runId,
    prNumber,
    question,
    context,
    askedAt: new Date().toISOString(),
    askedBy: 'upstream-sync[bot]',
    source: 'harness',
  })
}

export function defaultSyncState(): SyncState {
  return {
    lastSyncedUpstreamSha: null,
    lastSyncedAt: null,
    lastRunId: null,
    status: 'idle',
    openQuestions: [],
    activeBranch: null,
    activePrNumber: null,
    activeMergeBase: null,
  }
}

export function ensureUpstreamSyncScaffold(): void {
  initLedgerDir()
  try {
    readFileSync(STATE_PATH, 'utf8')
  } catch {
    writeState(defaultSyncState())
  }
  ensureGrillLogExists()
  try {
    readFileSync(QA_HISTORY_PATH, 'utf8')
  } catch {
    writeFileSync(QA_HISTORY_PATH, '')
  }
}

const SANDCASTLE_ENV_PATH = join('.sandcastle', '.env')

/**
 * Sandcastle only forwards env vars listed in `.sandcastle/.env` to agent CLIs.
 * Materialize from process env so CI secrets reach Claude Code / Codex.
 */
export function ensureSandcastleEnvFile(): void {
  mkdirSync('.sandcastle', { recursive: true })
  const entries: Array<[string, string | undefined]> = [
    ['ANTHROPIC_API_KEY', process.env.ANTHROPIC_API_KEY],
    ['CLAUDE_CODE_OAUTH_TOKEN', process.env.CLAUDE_CODE_OAUTH_TOKEN],
    ['OPENAI_API_KEY', process.env.OPENAI_API_KEY],
  ]
  const lines = entries
    .filter(([, value]) => Boolean(value?.trim()))
    .map(([key, value]) => `${key}=${value}`)
  if (lines.length === 0) return
  writeFileSync(SANDCASTLE_ENV_PATH, `# Generated by upstream-sync harness — do not commit\n${lines.join('\n')}\n`)
}

export function readState(): SyncState {
  try {
    return JSON.parse(readFileSync(STATE_PATH, 'utf8')) as SyncState
  } catch {
    return defaultSyncState()
  }
}

export function writeState(state: SyncState): void {
  writeFileSync(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`)
}

export function appendQaHistory(entry: Record<string, unknown>): void {
  writeFileSync(QA_HISTORY_PATH, `${JSON.stringify(entry)}\n`, { flag: 'a' })
}

export function runGit(args: string[], cwd = process.cwd()): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim()
}

function resolveGhToken(): string | undefined {
  for (const key of ['GH_PAT', 'UPSTREAM_SYNC_GH_TOKEN', 'GH_TOKEN'] as const) {
    const value = process.env[key]?.trim()
    if (value) return value
  }
  return undefined
}

export function runGh(args: string[]): string {
  const token = resolveGhToken()
  const env = { ...process.env }
  if (token) {
    env.GH_TOKEN = token
  } else {
    delete env.GH_TOKEN
  }
  return execFileSync('gh', args, { encoding: 'utf8', env }).trim()
}

/**
 * Short readme on the sync branch so GitHub always sees at least one commit ahead of the merge target.
 */
export function writeSyncBranchReadme(options: {
  runId: string
  syncBranch: string
  mergeBase: string
  upstreamSha: string
}): void {
  mkdirSync(UPSTREAM_SYNC_ROOT, { recursive: true })
  const content = [
    '# Upstream sync branch',
    '',
    `Draft PR: \`${options.syncBranch}\` → \`${options.mergeBase}\`.`,
    '',
    '| | |',
    '|---|---|',
    `| Run | \`${options.runId}\` |`,
    `| Sync branch | \`${options.syncBranch}\` |`,
    `| Merge into | \`${options.mergeBase}\` |`,
    `| Upstream | [simstudioai/sim@${options.upstreamSha.slice(0, 8)}](https://github.com/simstudioai/sim/commit/${options.upstreamSha}) |`,
    `| Opened | ${new Date().toISOString()} |`,
    '',
    'This note exists so the sync branch is always one commit ahead of the merge target when the draft PR opens.',
    'See `.upstream-sync/ledger/` for the full run ledger.',
    '',
  ].join('\n')
  writeFileSync(SYNC_BRANCH_README_PATH, content)
}

/** Commit the sync-branch readme so branch-to-branch PR creation succeeds on GitHub. */
export function commitSyncBranchScaffold(options: {
  runId: string
  syncBranch: string
  mergeBase: string
  upstreamSha: string
}): void {
  writeSyncBranchReadme(options)
  runGit(['add', SYNC_BRANCH_README_PATH])
  try {
    runGit(['diff', '--cached', '--quiet'])
    runGit(['commit', '--allow-empty', '-m', `upstream-sync(${options.runId}): sync branch note`])
  } catch {
    runGit(['commit', '-m', `upstream-sync(${options.runId}): sync branch note`])
  }
}

/** Update an existing draft PR body (e.g. after grill phase or on blocked/success). */
export function updateDraftPrBody(prNumber: number, body: string): void {
  runGh(['pr', 'edit', String(prNumber), '--body', body])
}

export function getPrReviewers(): string[] {
  const fromEnv = process.env.UPSTREAM_SYNC_PR_REVIEWERS?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (fromEnv?.length) return fromEnv

  try {
    const policy = JSON.parse(readFileSync(MERGE_POLICY_PATH, 'utf8')) as { prReviewers?: string[] }
    return policy.prReviewers?.filter(Boolean) ?? []
  } catch {
    return []
  }
}

export function isPrOpen(prNumber: number): boolean {
  try {
    const raw = runGh(['pr', 'view', String(prNumber), '--json', 'state'])
    const { state } = JSON.parse(raw) as { state: string }
    return state === 'OPEN'
  } catch {
    return false
  }
}

/**
 * Close a stale open sync PR when upstream main has moved and a fresh sync starts.
 */
export function closeSupersededPr(
  prNumber: number,
  options: { newUpstreamSha: string; runId: string; newBranch: string }
): void {
  if (!isPrOpen(prNumber)) return

  const comment = [
    '<!-- upstream-sync-superseded -->',
    '## Superseded by newer upstream sync',
    '',
    `Closed automatically: \`simstudioai/sim\` \`main\` advanced to [\`${options.newUpstreamSha.slice(0, 8)}\`](https://github.com/simstudioai/sim/commit/${options.newUpstreamSha}) before this PR was merged.`,
    '',
    `A fresh sync (\`${options.runId}\`) will open \`${options.newBranch}\` → \`${baseBranch()}\`.`,
    '',
    'Cherry-pick anything you still need from this branch into the new sync PR.',
  ].join('\n')

  runGh(['pr', 'comment', String(prNumber), '--body', comment])
  runGh(['pr', 'close', String(prNumber)])
  console.log(`Closed superseded sync PR #${prNumber}.`)
}

export function todayRunId(): string {
  return new Date().toISOString().slice(0, 10)
}

export function ledgerRunDir(runId: string): string {
  return join(LEDGER_DIR, runId)
}

export function ensureLedgerRunDir(runId: string): string {
  const dir = ledgerRunDir(runId)
  mkdirSync(dir, { recursive: true })
  return dir
}

export function initLedgerDir(): void {
  mkdirSync(LEDGER_DIR, { recursive: true })
}

export function upstreamRemote(): string {
  return process.env.UPSTREAM_REMOTE ?? 'upstream'
}

export function upstreamBranch(): string {
  return process.env.UPSTREAM_BRANCH ?? 'main'
}

export function upstreamRepo(): string {
  return process.env.UPSTREAM_REPO ?? 'simstudioai/sim'
}

let releaseBodiesCache: Map<string, string> | null = null

/** One paginated GitHub API call (uses `gh` + GH_TOKEN) instead of N unauthenticated curls. */
function loadUpstreamReleaseBodies(): Map<string, string> {
  if (releaseBodiesCache) return releaseBodiesCache

  releaseBodiesCache = new Map()

  try {
    const raw = runGh([
      'api',
      '--method',
      'GET',
      `repos/${upstreamRepo()}/releases?per_page=100`,
      '--paginate',
    ])
    const releases = JSON.parse(raw) as Array<{ tag_name?: string; body?: string | null }>
    for (const release of releases) {
      if (release.tag_name) {
        releaseBodiesCache.set(release.tag_name, release.body?.trim() ?? '')
      }
    }
  } catch {
    console.warn('Could not list upstream releases via gh api; falling back to commit bodies.')
  }

  return releaseBodiesCache
}

function releaseBodyFromCommit(entry: ReleaseNotesEntry): string | null {
  if (!entry.releaseCommitSha) return null
  try {
    const body = runGit(['show', '-s', '--format=%B', entry.releaseCommitSha])
    const lines = body.split('\n')
    const first = lines[0]?.trim() ?? ''
    if (first.startsWith(`${entry.version}:`)) {
      const rest = lines.slice(1).join('\n').trim()
      return rest || `_Release ${entry.version} — no release body on GitHub; commit has no details._`
    }
  } catch {
    // commit may not exist locally
  }
  return null
}

export const SYNC_BRANCH_PREFIX = 'upstream-sync/'

/** True when the branch name is a harness sync branch (not a valid PR base). */
export function isSyncBranch(name: string): boolean {
  return name.startsWith(SYNC_BRANCH_PREFIX)
}

/**
 * PR base / fork source — the branch upstream changes merge into (e.g. feat/github-merge-agent).
 * Never returns a sync branch; those are PR heads only.
 */
export function baseBranch(): string {
  const candidates = [
    process.env.TARGET_BRANCH,
    process.env.GITHUB_HEAD_REF,
    process.env.GITHUB_REF_NAME,
  ].filter((name): name is string => Boolean(name && name !== 'HEAD' && !isSyncBranch(name)))

  if (candidates.length > 0) return candidates[0]

  try {
    const state = readState()
    if (state.activeMergeBase && !isSyncBranch(state.activeMergeBase)) {
      return state.activeMergeBase
    }
  } catch {
    /* state not initialized yet */
  }

  const current = runGit(['branch', '--show-current'])
  if (current && !isSyncBranch(current)) return current

  throw new Error(
    'Could not determine merge target branch. Set TARGET_BRANCH (or run from a non upstream-sync/* branch).'
  )
}

/** Merge target for this run — persisted on resume, otherwise resolved from env/git. */
export function resolveMergeBase(state: SyncState, resume: boolean): string {
  if (resume && state.activeMergeBase && !isSyncBranch(state.activeMergeBase)) {
    return state.activeMergeBase
  }
  return baseBranch()
}

/** @deprecated Use baseBranch() */
export function targetBranch(): string {
  return baseBranch()
}

export function fetchUpstream(): void {
  runGit(['fetch', upstreamRemote(), upstreamBranch()])
}

export function upstreamHeadSha(): string {
  return runGit(['rev-parse', `${upstreamRemote()}/${upstreamBranch()}`])
}

export function commitsSince(baseSha: string | null, headSha: string): UpstreamCommit[] {
  const range = baseSha ? `${baseSha}..${headSha}` : headSha
  const format = '%H%x1f%ci%x1f%s'
  const lines = runGit(['log', `--format=${format}`, range, '--reverse'])
  if (!lines) return []

  return lines.split('\n').map((line) => {
    const [sha, date, title] = line.split('\x1f')
    const prMatch = title.match(/\(#(\d+)\)/)
    return {
      sha,
      date: date.slice(0, 10),
      title,
      prNumber: prMatch ? Number(prMatch[1]) : null,
    }
  })
}

export function groupConflictClusters(conflictFiles: string[]): ConflictCluster[] {
  const buckets = new Map<string, string[]>()

  for (const file of conflictFiles) {
    const parts = file.split('/')
    const prefix =
      parts.length >= 3
        ? `${parts[0]}/${parts[1]}/${parts[2]}/`
        : parts.length >= 2
          ? `${parts[0]}/${parts[1]}/`
          : `${parts[0]}/`
    const existing = buckets.get(prefix) ?? []
    existing.push(file)
    buckets.set(prefix, existing)
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([prefix, files], index) => ({
      id: `cluster-${index + 1}`,
      prefix,
      files: files.sort(),
    }))
}

export function listConflictFiles(): string[] {
  try {
    const out = runGit(['diff', '--name-only', '--diff-filter=U'])
    return out ? out.split('\n').filter(Boolean) : []
  } catch {
    return []
  }
}

export function substitutePrompt(template: string, args: Record<string, string>): string {
  return Object.entries(args).reduce(
    (acc, [key, value]) => acc.replaceAll(`{{${key}}}`, value),
    template
  )
}

export function writeRunLog(runId: string, sections: Record<string, string>): void {
  const dir = ensureLedgerRunDir(runId)
  const body = Object.entries(sections)
    .map(([heading, content]) => `## ${heading}\n\n${content.trim()}\n`)
    .join('\n')
  writeFileSync(join(dir, 'run.md'), `# Upstream Sync Run — ${runId}\n\n${body}\n`)
}

export function writeFbiReport(
  runId: string,
  upstreamCommits: UpstreamCommit[],
  forkOnlyNotes: string
): void {
  const dir = ensureLedgerRunDir(runId)
  const lines = upstreamCommits.map((c) => {
    const pr = c.prNumber ? `simstudioai/sim#${c.prNumber}` : 'no-pr'
    return `- **${c.date}** | \`${c.sha.slice(0, 8)}\` | ${pr} | ${c.title}`
  })

  writeFileSync(
    join(dir, 'fbi-report.md'),
    `# FBI Report — ${runId}\n\n## Upstream commits in this sync\n\n${lines.join('\n') || '_None_'}\n\n## Fork-only notes\n\n${forkOnlyNotes.trim() || '_None recorded._'}\n`
  )
}

export function writeSkippedReport(
  runId: string,
  entries: Array<{ date: string; pr: string; title: string; reason: string; impact: string }>
): void {
  const dir = ensureLedgerRunDir(runId)
  const lines = entries.map(
    (e) =>
      `### ${e.date} — ${e.pr} — ${e.title}\n\n- **Reason skipped:** ${e.reason}\n- **What we miss:** ${e.impact}\n`
  )

  writeFileSync(
    join(dir, 'skipped.md'),
    `# Skipped Upstream Changes — ${runId}\n\nChanges from simstudioai/sim we deliberately did not take during this sync.\n\n${lines.join('\n') || '_No upstream changes skipped._\n'}`
  )
}

export function appendExtensibilityNote(runId: string, note: string): void {
  const existing = readFileSync(EXTENSIBILITY_PATH, 'utf8')
  writeFileSync(EXTENSIBILITY_PATH, `${existing.trim()}\n\n## ${runId}\n\n${note.trim()}\n`)
}

export function writeClusterManifest(runId: string, clusters: ConflictCluster[]): void {
  const dir = ensureLedgerRunDir(runId)
  writeFileSync(join(dir, 'conflict-clusters.json'), `${JSON.stringify(clusters, null, 2)}\n`)
}

export function fetchReleaseNotesForVersion(version: string): string {
  const fromApi = loadUpstreamReleaseBodies().get(version)
  if (fromApi !== undefined) {
    return fromApi || `_Release ${version} has no body._`
  }
  return `_Could not fetch release notes for ${version}._`
}

/** @deprecated Use detectReleaseVersions + fetchAllUpstreamReleaseNotes */
export function fetchUpstreamReleaseNotes(version: string | null): string {
  if (!version) return '_No version tag detected in upstream commits._'
  return fetchReleaseNotesForVersion(version)
}

export interface ReleaseNotesEntry {
  version: string
  releaseCommitSha: string | null
  releaseDate: string | null
  body: string
}

/**
 * Collect every release version commit in the sync range (oldest → newest).
 * Matches upstream convention: `v0.7.13: …` as the first line of a release commit.
 */
export function detectReleaseVersions(commits: UpstreamCommit[]): ReleaseNotesEntry[] {
  const seen = new Set<string>()
  const entries: ReleaseNotesEntry[] = []

  for (const commit of commits) {
    const match = commit.title.match(/^(v[0-9]+\.[0-9]+\.[0-9]+):/)
    if (!match || seen.has(match[1])) continue
    seen.add(match[1])
    entries.push({
      version: match[1],
      releaseCommitSha: commit.sha,
      releaseDate: commit.date,
      body: '',
    })
  }

  return entries
}

export function fetchAllUpstreamReleaseNotes(entries: ReleaseNotesEntry[]): ReleaseNotesEntry[] {
  const apiBodies = loadUpstreamReleaseBodies()
  return entries.map((entry) => {
    const fromApi = apiBodies.get(entry.version)
    if (fromApi !== undefined) {
      return { ...entry, body: fromApi || `_Release ${entry.version} has no body._` }
    }
    const fromCommit = releaseBodyFromCommit(entry)
    return {
      ...entry,
      body: fromCommit ?? `_Could not fetch release notes for ${entry.version}._`,
    }
  })
}

export function formatReleaseNotesMarkdown(entries: ReleaseNotesEntry[]): string {
  if (entries.length === 0) {
    return '_No release versions detected in upstream commits since last sync._'
  }

  return entries
    .map((entry) => {
      const meta = [
        entry.releaseDate ? `Released ${entry.releaseDate}` : null,
        entry.releaseCommitSha ? `commit \`${entry.releaseCommitSha.slice(0, 8)}\`` : null,
      ]
        .filter(Boolean)
        .join(' · ')

      return `## ${entry.version}${meta ? `\n\n_${meta}_` : ''}\n\n${entry.body}`
    })
    .join('\n\n---\n\n')
}

export function writeReleaseNotesReport(runId: string, content: string, versionCount: number): void {
  const dir = ensureLedgerRunDir(runId)
  writeFileSync(
    join(dir, 'release-notes.md'),
    `# Release Notes — ${runId}\n\nAll upstream release notes from the last synced \`main\` SHA through the current sync (${versionCount} version${versionCount === 1 ? '' : 's'}).\n\n${content}\n`
  )
}

/** @deprecated Use detectReleaseVersions */
export function detectReleaseVersion(commits: UpstreamCommit[]): string | null {
  const versions = detectReleaseVersions(commits)
  return versions.length > 0 ? versions[versions.length - 1].version : null
}

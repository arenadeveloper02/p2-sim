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

export const COMPLETION_SIGNAL = '<promise>UPSTREAM_SYNC_COMPLETE</promise>'
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

function repoSlug(): { owner: string; repo: string } {
  const slug =
    process.env.GITHUB_REPOSITORY ??
    runGh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner'])
  const [owner, repo] = slug.split('/')
  return { owner, repo }
}

export function comparePullRequestUrl(mergeBase: string, branch: string): string {
  const { owner, repo } = repoSlug()
  return `https://github.com/${owner}/${repo}/compare/${mergeBase}...${branch}?expand=1`
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

export function runGh(args: string[]): string {
  const token = process.env.UPSTREAM_SYNC_GH_TOKEN ?? process.env.GH_TOKEN
  const env = token ? { ...process.env, GH_TOKEN: token } : process.env
  return execFileSync('gh', args, { encoding: 'utf8', env }).trim()
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

/**
 * PR base / fork source.
 * TEMP: defaults to current branch for harness validation on feat/github-merge-agent.
 * Restore `TARGET_BRANCH=version-4.2-main` in the workflow when ready.
 */
export function baseBranch(): string {
  if (process.env.TARGET_BRANCH) return process.env.TARGET_BRANCH
  if (process.env.GITHUB_HEAD_REF) return process.env.GITHUB_HEAD_REF
  const branch = runGit(['branch', '--show-current'])
  if (!branch) throw new Error('Could not determine current git branch')
  return branch
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

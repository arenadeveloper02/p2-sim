import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import {
  findOpenSyncPr,
  isPrOpen,
  isSyncBranch,
  openQuestionsPath,
  QUESTION_MARKER,
  readQaHistory,
  repoSlug,
  RESUME_COMMAND,
  runGh,
  runGit,
  syncGrillQaFromPr,
  type SyncState,
} from './config'

export function parseResumePrNumber(): number | null {
  const raw =
    process.env.RESUME_PR_NUMBER?.trim() ??
    process.env.GITHUB_EVENT_ISSUE_NUMBER?.trim() ??
    process.env.GITHUB_ISSUE_NUMBER?.trim()
  if (!raw) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

/**
 * Resolve the sync branch to resume — from state, current checkout, or resume PR head.
 */
export function resolveResumeSyncBranch(state: SyncState): string {
  if (state.activeBranch) return state.activeBranch

  try {
    const current = runGit(['branch', '--show-current'])
    if (isSyncBranch(current)) return current
  } catch {
    // fall through
  }

  const prNumber = parseResumePrNumber()
  if (prNumber) {
    try {
      const branch = runGh([
        'pr',
        'view',
        String(prNumber),
        '--json',
        'headRefName',
        '--jq',
        '.headRefName',
      ])
      if (branch && isSyncBranch(branch)) return branch
    } catch {
      // fall through
    }
  }

  throw new Error(
    'Could not resolve sync branch on resume. Set resume_pr or ensure state.activeBranch is persisted.'
  )
}

/**
 * Resolve the active sync PR from resume input, persisted state, or branch lookup.
 */
export function resolveActivePrNumber(options: {
  state: SyncState
  mergeBase: string
  syncBranch: string
  resumePrNumber?: number | null
}): number {
  const fromEnv = options.resumePrNumber ?? parseResumePrNumber()
  if (fromEnv && fromEnv > 0 && isPrOpen(fromEnv)) return fromEnv

  if (options.state.activePrNumber && isPrOpen(options.state.activePrNumber)) {
    return options.state.activePrNumber
  }

  return findOpenSyncPr(options.mergeBase, options.syncBranch)
}

export function hasResumeAnswerForPr(prNumber: number): boolean {
  return readQaHistory().some(
    (entry) =>
      entry.prNumber === prNumber &&
      entry.source === 'resume' &&
      Boolean(entry.answer?.includes(RESUME_COMMAND))
  )
}

export function shouldSkipParentGrill(options: {
  resume: boolean
  prNumber: number
}): boolean {
  if (!options.resume || options.prNumber <= 0) return false
  return hasResumeAnswerForPr(options.prNumber)
}

/** True when the open-questions ledger explicitly says nothing is pending. */
export function isNoneOpenQuestionsContent(content: string): boolean {
  const stripped = content.replaceAll(QUESTION_MARKER, '').trim()
  return /^#?\s*no open questions\b/i.test(stripped)
}

/** Read grill open-questions ledger content, or null when absent/empty. */
export function readOpenQuestionsFile(runId: string): string | null {
  const path = openQuestionsPath(runId)
  if (!existsSync(path)) return null
  const content = readFileSync(path, 'utf8').trim()
  return content.length > 0 ? content : null
}

/**
 * True when a PR issue comment still carries the question marker.
 * Draft PR bodies also use the marker as a template — only comments count.
 */
export function prHasQuestionMarkerComment(prNumber: number): boolean {
  if (prNumber <= 0) return false
  try {
    const { owner, repo } = repoSlug()
    const raw = runGh([
      'api',
      `repos/${owner}/${repo}/issues/${prNumber}/comments`,
      '--paginate',
    ])
    const comments = JSON.parse(raw) as Array<{ body?: string }>
    return comments.some((comment) => comment.body?.includes(QUESTION_MARKER))
  } catch {
    return false
  }
}

/**
 * True when grill left unanswered product questions in the ledger.
 * Source of truth is `.upstream-sync/ledger/<runId>/open-questions.md`.
 * Resume clears that file to "No open questions" before merge continues.
 */
export function hasUnansweredGrillQuestions(options: { runId: string }): boolean {
  const file = readOpenQuestionsFile(options.runId)
  return Boolean(file && !isNoneOpenQuestionsContent(file))
}

/** Mark open questions as resolved after a human resume answer. */
export function clearOpenQuestionsFile(runId: string): void {
  writeFileSync(
    openQuestionsPath(runId),
    [
      '# No open questions',
      '',
      'Resolved via `/upstream-sync resume` — decisions recorded in `grill-log.md` / `qa-history.jsonl`.',
      '',
    ].join('\n')
  )
}

/**
 * Pull PR comments into the ledger and clear open questions when a resume answer exists.
 */
export function ingestGrillQaFromPr(
  prNumber: number,
  runId: string,
  state: SyncState
): { added: number; state: SyncState } {
  const added = syncGrillQaFromPr(prNumber, runId)
  const answered = hasResumeAnswerForPr(prNumber)
  if (answered) {
    clearOpenQuestionsFile(runId)
  }
  return {
    added,
    state: answered ? { ...state, openQuestions: [] } : state,
  }
}

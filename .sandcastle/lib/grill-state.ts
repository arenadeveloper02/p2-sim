import {
  findOpenSyncPr,
  isPrOpen,
  isSyncBranch,
  readQaHistory,
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
  return {
    added,
    state: answered ? { ...state, openQuestions: [] } : state,
  }
}

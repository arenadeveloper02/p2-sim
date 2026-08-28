/**
 * Default UX policy for Arena Generative UI. The compiler and host enforce
 * this. The generator sees `ARENA_GENERATIVE_UI_HOST_UX_PROMPT` plus the
 * constitution; principles and nevers are derived from constitution.ts.
 */
export {
  ARENA_GENERATIVE_UI_UX_NEVERS,
  ARENA_GENERATIVE_UI_UX_PRINCIPLES,
} from '@/lib/arena-generative-ui/constitution'

/**
 * One notification channel per event. Host chrome owns these; the LLM must not
 * emit Alert/Toast/Modal for them.
 */
export const ARENA_GENERATIVE_UI_NOTIFICATION_POLICY = {
  fieldError: 'inline',
  apiFailure: 'banner',
  saveSucceeded: 'toast',
  destructive: 'confirmation',
  pageFailure: 'error-state',
  longRunning: 'progress-status',
} as const

/**
 * Short generator summary. Enforcement stays in the compiler and host; this
 * only stops the model from emitting a second copy of that chrome. Cited from
 * the constitution STATES and ACTIONS sections rather than rewritten ad hoc.
 */
export const ARENA_GENERATIVE_UI_HOST_UX_PROMPT = [
  'HOST UX: the runtime compiles loading, error, retry, save confirmation, and destructive confirm. Describe pages, copy, forms, which API, navigation, and empty-state copy.',
  'Bind every CTA or onLoad result region to a statePath so the host can skeleton it.',
  'Do not emit ProgressSteps, a filling 0–100 ProgressBar, or Spinner as the only wait for a long run. When the brief names status steps, elapsed, or Cancel, emit WorkingCard on the waiting page — the host ticks steps and progress together.',
  'Do not emit Alert, Toast, or Modal for field errors, API failures, save success, or delete confirm — the host owns those. Alert is only for in-content status the brief asked for (a disclaimer).',
  'Never invent API rows, never create fake timed progress, and never leave a results or detail page without a Back NavLink.',
].join(' ')

/**
 * Default UX policy for Arena Generative UI. The compiler and host enforce
 * this. The generator sees `ARENA_GENERATIVE_UI_HOST_UX_PROMPT` only.
 */
export const ARENA_GENERATIVE_UI_UX_PRINCIPLES = [
  'Generate interfaces that feel production-ready.',
  'Prefer clear visual hierarchy, obvious primary actions, predictable navigation, responsive layouts, accessible controls, progressive disclosure, contextual feedback, concise error messages, useful empty states, and skeleton loading for content.',
  'Optimistic updates only when safe (navigate-first). Never invent API data. Never create fake progress.',
  'Confirmation before destructive actions.',
  'For every async operation the platform provides loading, error, retry, disabled, and success behavior.',
].join('\n')

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
 * Author preview keeps runner error copy (HTTP 422, missing secrets). No GUI
 * sanitizer this pass.
 */
export const ARENA_GENERATIVE_UI_UX_NEVERS = [
  'silently discard user input',
  'silently fail an action',
  'overwrite newer data with stale responses',
  'show stale data as current without indication',
  'create inaccessible interactive elements',
  'create navigation that cannot be reached with keyboard',
  'expose secrets/API keys beyond existing missing-secret diagnostics',
  'submit the same mutation twice',
  'destroy user data without confirmation',
  'lose partial streaming results on failure',
  'block the entire page for a background refresh',
  'invent API data',
  'create fake progress',
  'trap the user in a page without recovery/navigation',
] as const

/**
 * Short generator summary. Enforcement stays in the compiler and host; this
 * only stops the model from emitting a second copy of that chrome.
 */
export const ARENA_GENERATIVE_UI_HOST_UX_PROMPT = [
  'HOST UX: the runtime compiles loading, error, retry, save confirmation, and destructive confirm. Describe pages, copy, forms, which API, navigation, and empty-state copy.',
  'Bind every CTA or onLoad result region to a statePath so the host can skeleton it.',
  'Do not emit ProgressSteps, a filling 0–100 ProgressBar, or Spinner as the only wait for a long run. When the brief names status steps, elapsed, or Cancel, emit WorkingCard on the waiting page — the host ticks steps and progress together.',
  'Do not emit Alert, Toast, or Modal for field errors, API failures, save success, or delete confirm — the host owns those. Alert is only for in-content status the brief asked for (a disclaimer).',
  'Never invent API rows, never create fake timed progress, and never leave a results or detail page without a Back NavLink.',
].join(' ')

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
  'HOST UX: the runtime compiles loading, error, retry, save confirmation, and destructive confirm. Describe pages, copy, forms, which API, navigation, and empty-state copy. Follow DATA STATE CONTRACT and ACTION CONTRACT — do not emit a second copy of that chrome.',
  'Alert, Toast, and Modal are allowed only for in-content jobs in COMPONENT SELECTION RULES (a disclaimer, brief-asked transient copy, a focused secondary action).',
  'The host sanitizes API errors, treats EmptyState children as the next useful action, and offers Refresh on loaded pages — do not emit a Refresh Button or a second error Alert.',
  'Follow ANTI-PATTERNS. Never leave a results or detail page without a Back NavLink.',
].join(' ')

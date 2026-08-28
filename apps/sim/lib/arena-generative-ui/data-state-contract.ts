/**
 * Explicit data-state behaviour for the spec LLM. Host compiles the chrome;
 * the generator binds statePath and writes domain copy.
 */

export const ARENA_GENERATIVE_UI_DATA_STATE_PROMPT = [
  'DATA STATE CONTRACT',
  'Every bound region follows these states. The runtime compiles the chrome; you bind statePath and write domain copy.',
  'loading — Bind statePath. The host skeletons that region in its catalog shape (table, card, stat, text). Do not emit a page-level Skeleton, Spinner, or ProgressBar as the wait. WorkingCard only when the brief named steps, estimate, or Cancel.',
  'empty — Name what is missing (emptyText or EmptyState title/body). EmptyState’s child is the next useful action (SearchField, Button, NavLink). Not a loading state.',
  'error — The host shows a banner in plain language with Retry when the action can be retried. Do not emit Alert, Toast, or Modal for API failure. Do not mention HTTP status, URLs, stack traces, or secrets.',
  'partial — Leave regions that already have data visible. Do not invent placeholder rows or fake metrics. The host marks incomplete regions busy; do not add a second ProgressBar.',
  'success — Bind the result and render the intended Table, Repeat, Stat, or DataText. Do not emit a success Alert; save confirmation is host toast.',
  'stale — Do not blank a region that already has data. Do not emit a Refresh Button; the host keeps the previous result and offers Refresh.',
].join('\n')

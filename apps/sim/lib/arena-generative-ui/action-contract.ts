/**
 * Explicit CTA lifecycle for the spec LLM. Host compiles disable, spinner,
 * toast, banner, and confirm; the generator binds actionId and the result.
 */

export const ARENA_GENERATIVE_UI_ACTION_CONTRACT_PROMPT = [
  'ACTION CONTRACT',
  'Every user-triggered CTA (SubmitButton, Button, SearchField, Chip with actionId) follows these phases. Page onLoad is DATA STATE CONTRACT, not this slot. The runtime compiles the chrome; you bind actionId, statePath, and optional onSuccess.navigate.',
  'before — The control is enabled. Destructive actions: the host confirms (do not emit Modal). Bind the CTA to actionId or Form. Mark required fields; the host validates on submit.',
  'during — The host disables that control, shows a spinner on it, and keeps the form and page visible. Do not emit ProgressSteps, Spinner, ProgressBar, or a disabled overlay. WorkingCard only when the brief named steps, estimate, or Cancel. Do not clear inputs. If onSuccess.navigate is set, the host navigates immediately — bind the destination region, not a loader on the form page the user left.',
  'success — Bind the result (statePath / layoutPlan hostKeys) and render Table, Repeat, Stat, or DataText. Same-page save with no visible result is host toast. Do not emit a success Alert or Toast. Optional navigate is onSuccess.navigate.',
  'error — The host shows a banner in plain language with Retry when the action can be retried (not destructive). Keep entered values. Do not emit Alert, Toast, or Modal. Do not mention HTTP status, URLs, stack traces, or secrets.',
].join('\n')

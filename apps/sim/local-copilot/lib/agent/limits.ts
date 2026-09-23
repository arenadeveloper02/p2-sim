/**
 * Loop limits for the Arena Copilot agent turn.
 *
 * These live outside the orchestrator because the system prompt states several
 * of them to the model verbatim — keeping one definition stops the prompt and
 * the enforcing code from drifting apart.
 */

/** Forced follow-up rounds before the turn stops chasing mandatory follow-ups. */
export const MAX_FORCED_FOLLOW_UP_ROUNDS = 6

/** Cap for "I am applying…" prose with no tool call — avoid infinite nudge loops. */
export const MAX_INTENT_CONTINUATION_ROUNDS = 5

/**
 * After query_logs / get_execution_logs / explain_error, force at most one more
 * model round so the turn does not settle on tool rows with an empty bubble.
 */
export const MAX_DEBUG_EXPLANATION_CONTINUATION_ROUNDS = 1

/** Successful create-then-edit_workflow calls before the post-build lock. */
export const MAX_POPULATE_EDITS = 5

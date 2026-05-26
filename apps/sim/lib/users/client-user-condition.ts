/** Injected into subblock condition `values` during editor layout (see `useEditorSubblockLayout`). */
export const CLIENT_USER_CONDITION_KEY = '__isClientUser' as const

const UNIPILE_COND_NEVER = '__unipile_cond_never__'

/**
 * Reads the client-user flag from condition evaluation values.
 */
export function resolveIsClientUserFromConditionValues(values?: Record<string, unknown>): boolean {
  return values?.[CLIENT_USER_CONDITION_KEY] === true
}

/**
 * Show a subblock only for client (external) users — hide for internal users.
 */
export function clientUserOnlyCondition(values?: Record<string, unknown>) {
  if (resolveIsClientUserFromConditionValues(values)) {
    return { field: 'operation', value: UNIPILE_COND_NEVER, not: true as const }
  }
  return { field: 'operation', value: UNIPILE_COND_NEVER }
}

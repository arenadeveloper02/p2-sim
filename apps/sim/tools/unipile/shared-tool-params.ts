import type { ToolConfig, WorkflowToolExecutionContext } from '@/tools/types'

export const unipileApiKeyToolParam = {
  unipileApiKey: {
    type: 'string',
    required: false,
    visibility: 'user-only',
    description:
      'Unipile API key for admin workspaces. Non-admin workspaces use UNIPILE_API_KEY from the server environment.',
  },
} as const satisfies ToolConfig['params']

/**
 * Merges execution context and optional block API key into internal Unipile proxy request bodies.
 */
export function attachUnipileInternalContext(
  params: Record<string, unknown>,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const ctx = params._context as WorkflowToolExecutionContext | undefined
  const result = { ...payload }
  if (ctx?.workspaceId) {
    result.workspaceId = ctx.workspaceId
  }
  const key = typeof params.unipileApiKey === 'string' ? params.unipileApiKey.trim() : ''
  if (key) {
    result.unipileApiKey = key
  }
  return result
}

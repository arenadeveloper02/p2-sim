import { filterUndefined } from '@sim/utils/object'
import type { ArenaGenerativeUiParams } from '@/tools/arena-generative-ui/types'

function omitNullish<T>(value: T | null | undefined): T | undefined {
  return value == null ? undefined : value
}

function sanitizeApiBinding(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value
  const record = value as Record<string, unknown>
  return filterUndefined({
    ...record,
    inputSchema: omitNullish(record.inputSchema),
    outputSchema: omitNullish(record.outputSchema),
    outputSchemaWarnings: omitNullish(record.outputSchemaWarnings),
    pagination: omitNullish(record.pagination),
  })
}

function sanitizeApiBindings(raw: unknown): unknown {
  const value = omitNullish(raw)
  if (value == null) return undefined
  if (!Array.isArray(value)) return value
  return value.map(sanitizeApiBinding)
}

/**
 * Build the generate/edit JSON body. Empty block fields are stored as `null`,
 * which Zod rejects on optional arrays — omit them instead of sending null.
 */
export function arenaGenerativeToolRequestBody(
  params: ArenaGenerativeUiParams
): Record<string, unknown> {
  return filterUndefined({
    userInput: omitNullish(params.userInput),
    editInstructions: omitNullish(params.editInstructions),
    existingDraftId: omitNullish(params.existingDraftId),
    screenshots: omitNullish(params.screenshots),
    pages: omitNullish(params.pages),
    entryPath: omitNullish(params.entryPath),
    apiBindings: sanitizeApiBindings(params.apiBindings),
    designNotes: omitNullish(params.designNotes),
    workspaceId: omitNullish(params._context?.workspaceId),
    workflowId: omitNullish(params._context?.workflowId),
    executionId: omitNullish(params._context?.executionId),
  })
}

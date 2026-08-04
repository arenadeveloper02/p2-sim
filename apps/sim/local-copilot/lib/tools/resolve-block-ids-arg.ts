/**
 * Accepts common model shapes for get_blocks_metadata (`blockIds`, `block_ids`, `blocks`).
 * Also accepts a bare string array under `params` (mis-shaped invoke_integration_tool call),
 * JSON-encoded arrays, comma-separated strings, singular `blockId`, and nested `args`/`input`.
 */
export function resolveBlockIdsArg(args: Record<string, unknown>): string[] {
  const candidates: unknown[] = [
    args.blockIds,
    args.block_ids,
    args.blocks,
    args.blockTypes,
    args.block_types,
    args.types,
    args.ids,
    args.blockId,
    args.block_id,
    args.params,
  ]

  for (const nestKey of ['args', 'input', 'data'] as const) {
    const nested = args[nestKey]
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const record = nested as Record<string, unknown>
      candidates.push(
        record.blockIds,
        record.block_ids,
        record.blocks,
        record.blockTypes,
        record.block_types,
        record.types,
        record.ids,
        record.blockId,
        record.block_id,
        record.params
      )
    }
  }

  for (const candidate of candidates) {
    const ids = coerceIdList(candidate)
    if (ids.length > 0) return ids
  }
  return []
}

/**
 * Returns args with a canonical `blockIds: string[]` when any alias resolves.
 * Leaves args unchanged when nothing usable is found.
 */
export function normalizeBlockIdsArgs(args: Record<string, unknown>): Record<string, unknown> {
  const blockIds = resolveBlockIdsArg(args)
  if (blockIds.length === 0) return args
  return { ...args, blockIds }
}

function coerceIdList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      if (typeof entry === 'string' && entry.trim()) return [entry.trim()]
      if (entry && typeof entry === 'object') {
        const record = entry as Record<string, unknown>
        for (const key of ['id', 'blockId', 'type', 'name'] as const) {
          const nested = record[key]
          if (typeof nested === 'string' && nested.trim()) return [nested.trim()]
        }
      }
      return []
    })
  }

  if (typeof value !== 'string' || !value.trim()) return []
  const trimmed = value.trim()
  if (trimmed.startsWith('[')) {
    try {
      return coerceIdList(JSON.parse(trimmed) as unknown)
    } catch {
      // fall through
    }
  }
  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
  }
  return [trimmed]
}

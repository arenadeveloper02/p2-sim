/** Matches synthetic ids: `{parentSubBlockId}-tool-{index}-{paramId}` (see ToolSubBlockRenderer). */
const ARENA_TOOL_INPUT_SPLIT = /-tool-(\d+)-/

/**
 * Returns the block param id (e.g. `task-project`) for branching; in tool-input, synthetic id is `...-tool-0-task-project`.
 */
export function arenaEffectiveSubBlockId(subBlockId: string): string {
  const segs = subBlockId.split(ARENA_TOOL_INPUT_SPLIT)
  if (segs.length === 3) return segs[2]!
  return subBlockId
}

/**
 * Same tool row, different field, e.g. `tools-tool-0-task-client` for project row `...-task-project`.
 * In the block editor, `subBlockId` is already the param id so this returns `siblingEffectiveParamId` unchanged.
 */
export function arenaSiblingSubBlockStoreKey(
  subBlockId: string,
  siblingEffectiveParamId: string
): string {
  const segs = subBlockId.split(ARENA_TOOL_INPUT_SPLIT)
  if (segs.length === 3) {
    return `${segs[0]}-tool-${segs[1]}-${siblingEffectiveParamId}`
  }
  return siblingEffectiveParamId
}

export function pickArenaClientId(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'object' && value !== null && 'clientId' in value) {
    return (value as { clientId?: string }).clientId
  }
  if (typeof value === 'string' && value.trim()) return value
  return undefined
}

export function pickArenaProjectId(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'object' && value !== null && 'sysId' in value) {
    return (value as { sysId?: string }).sysId
  }
  return undefined
}

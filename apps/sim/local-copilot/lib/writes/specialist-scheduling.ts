export interface SpecialistCallLike {
  id: string
  name: string
  arguments: string
}

const WRITE_SPECIALIST_DOMAINS = new Set([
  'workflow',
  'deploy',
  'auth',
  'knowledge',
  'table',
  'scheduled_task',
  'file',
  'media',
  'agent',
  'superagent',
])

function parseArgs(raw: string): Record<string, unknown> {
  try {
    return JSON.parse(raw || '{}') as Record<string, unknown>
  } catch {
    return {}
  }
}

/**
 * Resolves the write target used for specialist conflict detection.
 */
export function resolveSpecialistWriteTarget(call: SpecialistCallLike): string | null {
  if (!WRITE_SPECIALIST_DOMAINS.has(call.name)) return null
  const args = parseArgs(call.arguments)
  for (const key of ['workflowId', 'deploymentId', 'tableId', 'knowledgeBaseId', 'fileId']) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) return `${key}:${value.trim()}`
  }
  // Domain-level target when no explicit id is present — serialize same-domain writers together.
  return `domain:${call.name}`
}

/**
 * Partitions specialist calls so same-target writers never run concurrently.
 *
 * Independent calls stay in the same parallel group; conflicting writers are
 * emitted as subsequent serial groups while preserving overall order.
 */
export function partitionSpecialistCallsByWriteTarget(
  calls: SpecialistCallLike[]
): SpecialistCallLike[][] {
  if (calls.length <= 1) return [calls]

  const groups: SpecialistCallLike[][] = []
  let current: SpecialistCallLike[] = []
  const activeTargets = new Set<string>()

  for (const call of calls) {
    const target = resolveSpecialistWriteTarget(call)
    const conflicts = target !== null && activeTargets.has(target)
    if (conflicts && current.length > 0) {
      groups.push(current)
      current = []
      activeTargets.clear()
    }
    current.push(call)
    if (target) activeTargets.add(target)
  }

  if (current.length > 0) groups.push(current)
  return groups
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items]
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size))
  return chunks
}

/**
 * Write-safe groups further capped by the parallel specialist limit.
 */
export function buildSpecialistExecutionBatches(
  calls: SpecialistCallLike[],
  maxParallel: number
): SpecialistCallLike[][] {
  const writeSafeGroups = partitionSpecialistCallsByWriteTarget(calls)
  return writeSafeGroups.flatMap((group) => chunkArray(group, maxParallel))
}

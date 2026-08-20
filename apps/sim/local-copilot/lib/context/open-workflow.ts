/**
 * Resolves the currently open workflow for Arena Copilot system context.
 * Home chat attaches the canvas as a VFS pointer (`…/state.json`) rather than
 * a workflowId — after refresh that pointer must still load the live graph.
 */
export interface OpenWorkflowContextEntry {
  type?: string
  path?: string
}

export interface OpenWorkflowSnapshotEntry {
  id: string
  path?: string
}

/**
 * Prefers an explicit workflowId, then matches an attached workflow VFS path
 * against the workspace snapshot.
 */
export function resolveOpenWorkflowId(params: {
  workflowId?: string | null
  contexts?: OpenWorkflowContextEntry[]
  snapshotWorkflows?: OpenWorkflowSnapshotEntry[]
}): string | undefined {
  const explicit = params.workflowId?.trim()
  if (explicit) return explicit

  const workflows = params.snapshotWorkflows ?? []
  if (workflows.length === 0) return undefined

  for (const entry of params.contexts ?? []) {
    const path = entry.path?.trim()
    if (!path) continue
    if (!isWorkflowContextPointer(entry.type, path)) continue

    const match = workflows.find((workflow) => workflowPathMatches(workflow.path, path))
    if (match?.id) return match.id
  }

  return undefined
}

/**
 * Reads a workflow UUID from persisted or request-time resource tabs.
 */
export function extractWorkflowIdFromResources(resources: unknown): string | undefined {
  if (!Array.isArray(resources)) return undefined
  for (const resource of resources) {
    if (!resource || typeof resource !== 'object' || Array.isArray(resource)) continue
    const record = resource as { type?: unknown; id?: unknown }
    if (record.type !== 'workflow') continue
    if (typeof record.id === 'string' && record.id.trim()) return record.id.trim()
  }
  return undefined
}

/**
 * True when a mothership context entry points at a workflow VFS file.
 */
export function isWorkflowContextPointer(type: string | undefined, path: string): boolean {
  if (type === 'current_workflow' || type === 'workflow') return true
  return (
    (type === 'active_resource' || type === undefined) &&
    /(?:^|\/)workflows\/.+\/(?:state|meta)\.json$/.test(path)
  )
}

function workflowPathMatches(workflowDir: string | undefined, contextPath: string): boolean {
  const dir = workflowDir?.replace(/\/$/, '') ?? ''
  if (!dir) return false
  return (
    contextPath === `${dir}/state.json` ||
    contextPath === `${dir}/meta.json` ||
    contextPath.startsWith(`${dir}/`)
  )
}

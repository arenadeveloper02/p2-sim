import { isAdminWorkspace } from '@/lib/workspaces/is-admin-workspace'

type Listener = () => void

const cache = new Map<string, boolean>()
const listeners = new Set<Listener>()
let epoch = 0

function notify(): void {
  epoch += 1
  for (const listener of listeners) {
    listener()
  }
}

/**
 * Stores a resolved Zoom Admin access decision for sync block option filters.
 */
export function setZoomAdminAccessCache(workspaceId: string, canUse: boolean): void {
  const key = workspaceId.trim()
  if (!key) return
  if (cache.get(key) === canUse) return
  cache.set(key, canUse)
  notify()
}

/**
 * Sync read for Zoom Admin UI (operation options). Prefer the fetched cache;
 * until loaded, fall back to env {@link isAdminWorkspace}.
 */
export function resolveZoomAdminAccessForUi(workspaceId: string | null | undefined): boolean {
  if (!workspaceId || typeof workspaceId !== 'string') return false
  const key = workspaceId.trim()
  if (!key) return false
  if (cache.has(key)) return cache.get(key) === true
  return isAdminWorkspace(key)
}

export function subscribeZoomAdminAccess(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function getZoomAdminAccessEpoch(): number {
  return epoch
}

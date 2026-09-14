/**
 * Pagination widget helpers: shared local page keys and authored-control detection.
 */

export type PaginationMode = 'pages' | 'more'

interface SpecElement {
  type?: string
  props?: Record<string, unknown>
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function parsePaginationMode(value: unknown, fallback: PaginationMode): PaginationMode {
  return value === 'more' || value === 'pages' ? value : fallback
}

/**
 * Local paging key. Prefer statePath so Table/Repeat/List and Pagination share
 * the same page when they bind the same collection.
 */
export function paginationPageKey(
  elementId: string,
  statePath: string,
  scopeIndex?: number
): string {
  if (scopeIndex != null) return `${elementId}:${scopeIndex}`
  return statePath || elementId
}

/** True when the spec emitted Pagination that owns chrome for this collection. */
export function specHasPaginationControl(
  elements: Record<string, SpecElement>,
  statePath: string
): boolean {
  return Object.values(elements).some((element) => {
    if (element.type !== 'Pagination') return false
    const path = asString(element.props?.statePath)
    return !path || path === statePath
  })
}

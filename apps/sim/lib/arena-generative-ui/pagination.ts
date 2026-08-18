import { omit } from '@sim/utils/object'
import { isTruthyFieldValue } from '@/lib/arena-generative-ui/form-fields'
import type { ArenaGenerativePagination } from '@/lib/arena-generative-ui/types'

const DEFAULT_LIMIT = 20
const MIN_LIMIT = 1
const MAX_LIMIT = 100

/** Host-state keys a Load more Button may send without copying the whole list. */
const PAGINATION_ACTION_VALUE_KEYS = ['cursor', 'nextCursor', 'offset', 'limit', 'page'] as const

export function clampPaginationLimit(raw: unknown): number {
  const parsed = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT
  return Math.min(Math.max(Math.trunc(parsed), MIN_LIMIT), MAX_LIMIT)
}

function topLevelValue(data: unknown, key: string): unknown {
  if (!key || !data || typeof data !== 'object' || Array.isArray(data)) return undefined
  return (data as Record<string, unknown>)[key]
}

function nonEmptyText(value: unknown): string {
  if (value == null) return ''
  const text = String(value).trim()
  return text
}

/**
 * Injects limit and the cursor/offset the binding declared so the request always
 * carries a page size. Empty cursor values are dropped rather than sent as "".
 */
export function applyPaginationToInput(
  pagination: ArenaGenerativePagination | undefined,
  mapped: Record<string, unknown>
): Record<string, unknown> {
  if (!pagination) return mapped
  const next = { ...mapped }
  const limitParam = pagination.limitParam ?? 'limit'
  next[limitParam] = clampPaginationLimit(
    next[limitParam] == null || next[limitParam] === '' ? pagination.limit : next[limitParam]
  )

  if (pagination.mode === 'cursor') {
    const cursorParam = pagination.cursorParam ?? 'cursor'
    const cursorValue = nonEmptyText(next[cursorParam] ?? next.nextCursor ?? next.cursor)
    if (cursorValue) {
      next[cursorParam] = cursorValue
    }
    const drop: string[] = []
    if (!cursorValue) drop.push(cursorParam)
    if (cursorParam !== 'nextCursor') drop.push('nextCursor')
    if (cursorParam !== 'cursor') drop.push('cursor')
    return drop.length > 0 ? omit(next, drop) : next
  }

  const offsetParam = pagination.offsetParam ?? 'offset'
  const offsetValue = Number(next[offsetParam] ?? next.offset ?? 0)
  next[offsetParam] = Number.isFinite(offsetValue) && offsetValue > 0 ? Math.trunc(offsetValue) : 0
  return offsetParam === 'offset' ? next : omit(next, ['offset'])
}

/**
 * True when this request is page 2+ — a non-empty cursor, or offset greater than 0.
 * First onLoad / Search calls replace the list; Load more appends.
 */
export function isSubsequentPage(
  pagination: ArenaGenerativePagination,
  mappedInput: Record<string, unknown>
): boolean {
  if (pagination.mode === 'cursor') {
    const cursorParam = pagination.cursorParam ?? 'cursor'
    return (
      nonEmptyText(mappedInput[cursorParam] ?? mappedInput.nextCursor ?? mappedInput.cursor)
        .length > 0
    )
  }
  const offsetParam = pagination.offsetParam ?? 'offset'
  const offset = Number(mappedInput[offsetParam] ?? mappedInput.offset ?? 0)
  return Number.isFinite(offset) && offset > 0
}

/**
 * Host-state patch written alongside the items array: `hasMore`, plus `nextCursor`
 * (cursor mode) or the next `offset` (offset mode).
 */
export function paginationStateFromData(
  pagination: ArenaGenerativePagination,
  data: unknown,
  mappedInput: Record<string, unknown>
): Record<string, unknown> {
  const items = topLevelValue(data, pagination.items)
  const itemCount = Array.isArray(items) ? items.length : 0
  const limitParam = pagination.limitParam ?? 'limit'
  const limit = clampPaginationLimit(mappedInput[limitParam] ?? pagination.limit)

  let hasMore: boolean
  if (pagination.hasMore) {
    hasMore = isTruthyFieldValue(topLevelValue(data, pagination.hasMore))
  } else if (pagination.mode === 'cursor') {
    const cursorField = pagination.cursor ?? 'nextCursor'
    hasMore = nonEmptyText(topLevelValue(data, cursorField)).length > 0
  } else {
    hasMore = itemCount >= limit
  }

  const patch: Record<string, unknown> = { hasMore }
  if (pagination.mode === 'cursor') {
    const cursorField = pagination.cursor ?? 'nextCursor'
    const nextCursor = topLevelValue(data, cursorField)
    patch.nextCursor = nextCursor == null ? '' : nextCursor
  } else {
    const offsetParam = pagination.offsetParam ?? 'offset'
    const currentOffset = Number(mappedInput[offsetParam] ?? 0)
    const base = Number.isFinite(currentOffset) && currentOffset > 0 ? Math.trunc(currentOffset) : 0
    patch.offset = hasMore ? base + itemCount : base
  }
  return patch
}

function uniqueKeys(keys: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const key of keys) {
    const trimmed = key.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

/**
 * Keys whose arrays should concatenate in host state. Pagination appends the
 * items key on page 2+; `action.append` always concatenates when both sides
 * are arrays (empty current state still replaces).
 */
export function collectAppendKeys(
  pagination: ArenaGenerativePagination | undefined,
  mappedInput: Record<string, unknown>,
  actionAppend?: string[]
): string[] {
  const keys: string[] = []
  if (pagination && isSubsequentPage(pagination, mappedInput)) {
    keys.push(pagination.items)
  }
  if (actionAppend) {
    keys.push(...actionAppend)
  }
  return uniqueKeys(keys)
}

/** Overlay of pagination cursor/offset onto Button action values. */
export function paginationActionValues(state: Record<string, unknown>): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const key of PAGINATION_ACTION_VALUE_KEYS) {
    if (state[key] !== undefined) {
      values[key] = state[key]
    }
  }
  return values
}

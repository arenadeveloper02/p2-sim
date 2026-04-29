import type { UnipileListPagedItemsOutput } from '@/tools/unipile/types'

/**
 * Normalizes Unipile list payloads that expose `items` and optional `cursor` / `paging`.
 */
export function parseUnipilePagedBody(data: Record<string, unknown>): UnipileListPagedItemsOutput {
  const rawItems = data.items
  const items = Array.isArray(rawItems) ? rawItems : []
  const paging =
    data.paging && typeof data.paging === 'object' && data.paging !== null
      ? (data.paging as Record<string, unknown>)
      : null
  const pagingCursor =
    paging && typeof paging.cursor === 'string' ? (paging.cursor as string) : null
  const topCursor = typeof data.cursor === 'string' ? data.cursor : null

  return {
    object: typeof data.object === 'string' ? data.object : null,
    item_count: items.length,
    items,
    cursor: topCursor ?? pagingCursor,
    paging,
    total_items: typeof data.total_items === 'number' ? data.total_items : null,
    fetch_all: data.fetch_all === true ? true : undefined,
    pages_fetched: typeof data.pages_fetched === 'number' ? data.pages_fetched : undefined,
    truncated: data.truncated === true ? true : undefined,
    truncation_reason:
      data.truncation_reason === 'max_pages' || data.truncation_reason === 'max_items'
        ? data.truncation_reason
        : undefined,
  }
}

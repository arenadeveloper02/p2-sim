/**
 * Unipile GET /api/v1/users/relations — page size and cursor extraction.
 * Docs: `limit` integer 1–1000 per page.
 * @see https://developer.unipile.com/reference/userscontroller_getrelations
 */
export const UNIPILE_RELATIONS_PAGE_LIMIT = 1000

const MAX_RELATION_PAGES = 500

export function extractUnipileRelationsNextCursor(
  body: Record<string, unknown>
): string | undefined {
  const top = body.cursor
  if (typeof top === 'string' && top.trim().length > 0) return top.trim()
  const paging = body.paging
  if (paging && typeof paging === 'object' && paging !== null) {
    const c = (paging as Record<string, unknown>).cursor
    if (typeof c === 'string' && c.trim().length > 0) return c.trim()
  }
  return undefined
}

export interface FetchAllUnipileUserRelationsOptions {
  baseUrl: string
  apiKey: string
  accountId: string
  /** Unipile `filter` query — filter by user name */
  filter?: string | null
}

/**
 * Follows `cursor` until all relation pages are loaded (or safety cap).
 */
export async function fetchAllUnipileUserRelationItems(
  options: FetchAllUnipileUserRelationsOptions
): Promise<{ items: unknown[]; object: string | null }> {
  const { baseUrl, apiKey, accountId } = options
  const filterTrim =
    typeof options.filter === 'string' && options.filter.trim() !== ''
      ? options.filter.trim()
      : undefined

  const allItems: unknown[] = []
  let object: string | null = null
  /** Cursor for the *next* upstream request (undefined on first page). */
  let pageCursor: string | undefined

  let pages = 0
  while (pages < MAX_RELATION_PAGES) {
    pages += 1
    const qs = new URLSearchParams()
    qs.set('account_id', accountId)
    qs.set('limit', String(UNIPILE_RELATIONS_PAGE_LIMIT))
    if (filterTrim) qs.set('filter', filterTrim)
    if (pageCursor) qs.set('cursor', pageCursor)

    const url = `${baseUrl}/api/v1/users/relations?${qs.toString()}`
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'X-API-KEY': apiKey,
      },
    })

    const responseText = await res.text()
    if (!res.ok) {
      throw new Error(responseText || res.statusText || 'Unipile request failed')
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(responseText) as Record<string, unknown>
    } catch {
      throw new Error('Invalid JSON from Unipile')
    }

    if (typeof parsed.object === 'string') {
      object = parsed.object
    }

    const pageItems = Array.isArray(parsed.items) ? parsed.items : []
    allItems.push(...pageItems)

    const next = extractUnipileRelationsNextCursor(parsed)
    if (!next) {
      break
    }
    if (next === pageCursor) {
      break
    }
    pageCursor = next
  }

  return { items: allItems, object }
}

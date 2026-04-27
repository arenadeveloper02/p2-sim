/**
 * Unipile GET /api/v1/posts/{post_id}/reactions — pagination helpers.
 * Query: account_id, limit (1–100), optional cursor, optional comment_id.
 * @see https://developer.unipile.com/reference (posts reactions)
 */
export const UNIPILE_POST_REACTIONS_PAGE_LIMIT = 100

const MAX_REACTION_PAGES = 500

export function extractUnipilePostReactionsNextCursor(
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

export interface FetchAllUnipilePostReactionsOptions {
  baseUrl: string
  apiKey: string
  postId: string
  accountId: string
  commentId?: string | null
  /** Per-request page size, clamped to 1–100 */
  limit?: number | null
}

export async function fetchAllUnipilePostReactionItems(
  options: FetchAllUnipilePostReactionsOptions
): Promise<{ items: unknown[]; object: string | null; paging: Record<string, unknown> | null }> {
  const { baseUrl, apiKey, postId, accountId } = options
  const commentTrim =
    typeof options.commentId === 'string' && options.commentId.trim() !== ''
      ? options.commentId.trim()
      : undefined
  let pageLimit =
    typeof options.limit === 'number' && Number.isFinite(options.limit)
      ? Math.trunc(options.limit)
      : UNIPILE_POST_REACTIONS_PAGE_LIMIT
  if (pageLimit < 1) pageLimit = 1
  if (pageLimit > UNIPILE_POST_REACTIONS_PAGE_LIMIT) pageLimit = UNIPILE_POST_REACTIONS_PAGE_LIMIT

  const allItems: unknown[] = []
  let object: string | null = null
  let lastPaging: Record<string, unknown> | null = null
  let pageCursor: string | undefined

  let pages = 0
  while (pages < MAX_REACTION_PAGES) {
    pages += 1
    const qs = new URLSearchParams()
    qs.set('account_id', accountId)
    qs.set('limit', String(pageLimit))
    if (commentTrim) qs.set('comment_id', commentTrim)
    if (pageCursor) qs.set('cursor', pageCursor)

    const encoded = encodeURIComponent(postId.trim())
    const url = `${baseUrl}/api/v1/posts/${encoded}/reactions?${qs.toString()}`

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
    if (parsed.paging && typeof parsed.paging === 'object' && parsed.paging !== null) {
      lastPaging = parsed.paging as Record<string, unknown>
    }

    const pageItems = Array.isArray(parsed.items) ? parsed.items : []
    allItems.push(...pageItems)

    const next = extractUnipilePostReactionsNextCursor(parsed)
    if (!next) {
      break
    }
    if (next === pageCursor) {
      break
    }
    pageCursor = next
  }

  return { items: allItems, object, paging: lastPaging }
}

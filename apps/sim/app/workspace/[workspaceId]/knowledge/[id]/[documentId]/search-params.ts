import { parseAsInteger, parseAsString, parseAsStringLiteral } from 'nuqs/server'
import { createSortParams } from '@/lib/url-state'

/** Chunk `enabled` filter buckets, matching the status filter dropdown. */
const ENABLED_FILTERS = ['all', 'enabled', 'disabled'] as const

/** Sortable chunk columns, matching the `Resource.Options` sort menu ids. */
export const CHUNK_SORT_COLUMNS = ['index', 'tokens', 'status'] as const

/**
 * `sort` / `dir` follow the shared sort convention (see `useUrlSort`), in
 * nullable mode: with no active sort the chunk query omits `sortBy` entirely
 * (server default order), which is distinct from any explicit column, so an
 * explicit selection always persists in the URL and clearing strips both.
 */
export const documentChunkSortParams = createSortParams(CHUNK_SORT_COLUMNS)

/**
 * Co-located, typed URL query-param definitions for the knowledge document
 * (chunk list + inline chunk editor) page. The client (`Document`) consumes this
 * typed param definition as the single source of truth.
 *
 * - `page` is the chunk pagination page, shareable and bookmarkable. It defaults
 *   to 1 and clears from the URL at the default to keep links clean.
 * - `chunk` deep-links a specific chunk so it can be focused/opened in the inline
 *   editor from a shared link.
 * - `chunkIndex` is an optional companion to `chunk` for deep links that need to
 *   land on the correct pagination page before the target chunk is in the loaded
 *   page (e.g. open-in-new-tab from the context menu). Nullable because absence
 *   means "no page hint"; cleared when the chunk editor closes.
 * - `search` is the chunk content search. The input is controlled directly by
 *   the instant nuqs value; only its URL write is debounced via
 *   `useDebouncedSearchSetter` — never written on every keystroke.
 * - `enabled` filters chunks by enabled status (`all` clears from the URL),
 *   mirroring the same filter on the knowledge base document list.
 */
export const documentParsers = {
  page: parseAsInteger.withDefault(1),
  chunk: parseAsString,
  chunkIndex: parseAsInteger,
  search: parseAsString.withDefault(''),
  enabled: parseAsStringLiteral(ENABLED_FILTERS).withDefault('all'),
} as const

/**
 * Shared nuqs options for the document page. Pagination is a transient view
 * change, so it replaces history rather than churning the back stack; defaults
 * clear from the URL.
 */
export const documentUrlKeys = {
  history: 'replace',
  clearOnDefault: true,
} as const

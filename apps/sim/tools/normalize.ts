/**
 * Normalizes a tool ID by stripping resource ID suffix (UUID/tableId).
 * Workflow tools: 'workflow_executor_<uuid>' -> 'workflow_executor'
 * Knowledge tools: 'knowledge_search_<uuid>' -> 'knowledge_search'
 * Table tools: 'table_query_rows_<tableId>' -> 'table_query_rows'
 *
 * Pure string utility — no server dependencies, safe to import in client components.
 *
 * For Usage By Tools analytics (pattern-based, no static op list), use
 * {@link normalizeUsageToolBucketId}.
 */

/**
 * A trailing `_v2`-style segment is a VERSION marker, not a resource id, so it
 * must not be stripped: `table_query_rows_v2` is its own registered tool, and
 * normalizing it to `table_query_rows` silently executes the v1 tool's request
 * shape under the v2 tool's name.
 */
const VERSION_SUFFIX = /^v\d+$/

/** Standard UUID (8-4-4-4-12 hex with hyphens). */
const UUID_HYPHEN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Same UUID after hyphens were normalized to underscores. */
const UUID_UNDERSCORE = /^[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/i

/** Mongo-style ObjectId (24 hex) or compact UUID (32 hex). */
const LONG_HEX_ID = /^[0-9a-f]{24}$|^[0-9a-f]{32}$/i

/** Long numeric resource ids — short numbers (versions, counts) stay. */
const LONG_NUMERIC_ID = /^\d{10,}$/

function isDynamicResourceIdSegment(segment: string): boolean {
  const value = segment.trim()
  if (!value) return false
  return (
    UUID_HYPHEN.test(value) ||
    UUID_UNDERSCORE.test(value) ||
    LONG_HEX_ID.test(value) ||
    LONG_NUMERIC_ID.test(value)
  )
}

/**
 * Strips a trailing dynamically injected resource id (UUID / ObjectId / long hex /
 * long numeric). Leaves ops like `google_ads_v1_query` and `facebook_ads_query` alone.
 */
function stripDynamicResourceId(toolId: string): string {
  const trimmed = toolId.trim()
  if (!trimmed) return toolId

  const parts = trimmed.split('_')
  if (parts.length >= 6) {
    const lastFive = parts.slice(-5).join('_')
    if (UUID_UNDERSCORE.test(lastFive)) {
      return parts.slice(0, -5).join('_')
    }
  }

  if (parts.length >= 2) {
    const last = parts[parts.length - 1]
    if (last && isDynamicResourceIdSegment(last)) {
      return parts.slice(0, -1).join('_')
    }
  }

  return trimmed
}

/**
 * When an API version sits in the middle (`service_v1_action`), keep the service
 * prefix. A trailing version (`table_query_rows_v2`) is a real tool id — leave it.
 */
function stripEmbeddedApiVersion(toolId: string): string {
  const match = /^(.*)_v\d+_.+$/i.exec(toolId)
  return match?.[1] && match[1].length > 0 ? match[1] : toolId
}

/**
 * Usage By Tools bucket id: strip generated resource suffixes and mid-id API
 * versions. No static per-tool map.
 *
 * - `knowledge_search_<uuid>` → `knowledge_search`
 * - `google_ads_v1_query` → `google_ads`
 * - `facebook_ads_query` → unchanged
 */
export function normalizeUsageToolBucketId(toolId: string): string {
  return stripEmbeddedApiVersion(stripDynamicResourceId(toolId.trim()))
}

/**
 * Longest id first, so a versioned op claims its own suffixed ids before the
 * unversioned prefix can match them (`table_query_rows_v2_<tableId>` must
 * normalize to `table_query_rows_v2`, not `table_query_rows`).
 */
function stripResourceSuffix(toolId: string, ops: string[]): string | null {
  for (const op of [...ops].sort((a, b) => b.length - a.length)) {
    if (!toolId.startsWith(`${op}_`) || toolId.length <= op.length + 1) continue
    if (VERSION_SUFFIX.test(toolId.slice(op.length + 1))) continue
    return op
  }
  return null
}

export function normalizeToolId(toolId: string): string {
  // Custom (deploy-as-block) tools: 'deployed_block_executor_custom_block_<id>' ->
  // 'deployed_block_executor'. Note the id deliberately does NOT start with
  // `custom_` — that prefix is the user-defined custom-tool namespace
  // (`isCustomTool`), and colliding with it misroutes resolution and permissions.
  if (
    toolId.startsWith('deployed_block_executor_') &&
    toolId.length > 'deployed_block_executor_'.length
  ) {
    return 'deployed_block_executor'
  }

  if (toolId.startsWith('workflow_executor_') && toolId.length > 'workflow_executor_'.length) {
    return 'workflow_executor'
  }

  const knowledgeOps = ['knowledge_search', 'knowledge_upload_chunk', 'knowledge_create_document']
  const knowledge = stripResourceSuffix(toolId, knowledgeOps)
  if (knowledge) return knowledge

  const tableOps = [
    'table_query_rows',
    'table_query_rows_v2',
    'table_insert_row',
    'table_batch_insert_rows',
    'table_update_row',
    'table_update_rows_by_filter',
    'table_delete_rows_by_filter',
    'table_upsert_row',
    'table_get_row',
    'table_delete_row',
    'table_get_schema',
  ]
  const table = stripResourceSuffix(toolId, tableOps)
  if (table) return table

  return toolId
}

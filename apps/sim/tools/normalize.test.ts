/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { normalizeToolId, normalizeUsageToolBucketId } from '@/tools/normalize'

describe('normalizeUsageToolBucketId', () => {
  it('strips UUID / ObjectId / long numeric suffixes without a tool allowlist', () => {
    expect(
      normalizeUsageToolBucketId('knowledge_search_ecc75653-ff03-4178-82e3-9d2a284c6804')
    ).toBe('knowledge_search')
    expect(normalizeUsageToolBucketId('any_tool_507f1f77bcf86cd799439011')).toBe('any_tool')
    expect(normalizeUsageToolBucketId('hook_12345678901234567890')).toBe('hook')
  })

  it('strips mid-id API versions to the service prefix', () => {
    expect(normalizeUsageToolBucketId('google_ads_v1_query')).toBe('google_ads')
    expect(normalizeUsageToolBucketId('google_ads_v2_get_campaigns')).toBe('google_ads')
  })

  it('leaves legitimate operation tokens alone', () => {
    expect(normalizeUsageToolBucketId('facebook_ads_query')).toBe('facebook_ads_query')
    expect(normalizeUsageToolBucketId('exa_search')).toBe('exa_search')
    expect(normalizeUsageToolBucketId('table_query_rows_v2')).toBe('table_query_rows_v2')
  })
})

describe('normalizeToolId', () => {
  it('strips a resource-id suffix', () => {
    expect(normalizeToolId('table_query_rows_tbl_1a2c1741')).toBe('table_query_rows')
    expect(normalizeToolId('knowledge_search_5cc56998-3e1d-4d91')).toBe('knowledge_search')
    expect(normalizeToolId('workflow_executor_f3d81b32')).toBe('workflow_executor')
    expect(normalizeToolId('deployed_block_executor_custom_block_9')).toBe(
      'deployed_block_executor'
    )
  })

  it('leaves a bare tool id alone', () => {
    expect(normalizeToolId('table_query_rows')).toBe('table_query_rows')
    expect(normalizeToolId('gmail_send')).toBe('gmail_send')
  })

  /**
   * Regression: `table_query_rows_v2` starts with `table_query_rows_`, so the
   * resource-suffix strip turned it into the v1 tool. The executor then logged
   * the v2 id while issuing v1's `GET /rows?filter=<predicate>` — which reached
   * the legacy filter compiler and 400'd on a correctly configured v2 block.
   */
  it('does not mistake a version suffix for a resource id', () => {
    expect(normalizeToolId('table_query_rows_v2')).toBe('table_query_rows_v2')
  })

  it('still strips a resource id from a VERSIONED op', () => {
    expect(normalizeToolId('table_query_rows_v2_tbl_1a2c1741')).toBe('table_query_rows_v2')
  })

  it('is not fooled by a table id that merely starts with v', () => {
    expect(normalizeToolId('table_query_rows_v2x')).toBe('table_query_rows')
    expect(normalizeToolId('table_query_rows_version')).toBe('table_query_rows')
  })
})

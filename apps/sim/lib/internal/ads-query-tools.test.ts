/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { executeBingAdsTool } from '@/lib/internal/bing-ads/execute-tool'
import { executeFacebookAdsTool } from '@/lib/internal/facebook-ads/execute-tool'
import { executeGoogleAdsV1Tool } from '@/lib/internal/google-ads-v1/execute-tool'
import {
  getInternalToolOperationHandler,
  isInternalToolOperationRegistered,
} from '@/lib/internal/tool-operations/registry.server'
import type { InternalToolOperationCall } from '@/lib/internal/tool-operations/types'
import { bingAdsQueryTool } from '@/tools/bing_ads/query'
import { facebookAdsQueryTool } from '@/tools/facebook_ads'
import { googleAdsV1QueryTool } from '@/tools/google_ads_v1/query'
import { isInternalToolConfig } from '@/tools/types'

function createCall(toolId: string, input: unknown): InternalToolOperationCall {
  return {
    toolId,
    input,
    headers: new Headers(),
    context: { workflowId: 'workflow-1', workspaceId: 'workspace-1', userId: 'user-1' },
    requestId: 'request-1',
  }
}

describe('ads query in-process tools', () => {
  it('declares in-process operations instead of relative HTTP URLs', () => {
    expect(isInternalToolConfig(googleAdsV1QueryTool)).toBe(true)
    expect(isInternalToolConfig(facebookAdsQueryTool)).toBe(true)
    expect(isInternalToolConfig(bingAdsQueryTool)).toBe(true)
    expect(googleAdsV1QueryTool.request).toBeUndefined()
    expect(facebookAdsQueryTool.request).toBeUndefined()
    expect(bingAdsQueryTool.request).toBeUndefined()
  })

  it('registers handlers for each ads query tool', async () => {
    for (const toolId of ['google_ads_v1_query', 'facebook_ads_query', 'bing_ads_query'] as const) {
      expect(isInternalToolOperationRegistered(toolId)).toBe(true)
      expect(await getInternalToolOperationHandler(toolId)).toBeTypeOf('function')
    }
  })

  it('rejects missing natural-language queries', async () => {
    const google = await executeGoogleAdsV1Tool(
      createCall('google_ads_v1_query', { accounts: 'acme' })
    )
    expect(google.status).toBe(400)

    const facebook = await executeFacebookAdsTool(
      createCall('facebook_ads_query', { account: 'acme' })
    )
    expect(facebook.status).toBe(400)

    const bing = await executeBingAdsTool(createCall('bing_ads_query', { account: 'acme' }))
    expect(bing.status).toBe(400)
  })
})

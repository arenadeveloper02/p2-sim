import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { SearchOnline } from '@/lib/copilot/generated/tool-catalog-v1'
import { projectToolErrorMessageForCopilot } from '@/lib/copilot/request/tools/resolved-secret-result'
import type { BaseServerTool, ServerToolContext } from '@/lib/copilot/tools/server/base-tool'
import { env } from '@/lib/core/config/env'
import { getEffectiveDecryptedEnv } from '@/lib/environment/utils'
import { executeTool } from '@/tools'

interface OnlineSearchParams {
  query: string
  num?: number
  type?: string
  gl?: string
  hl?: string
}

interface SearchResult {
  title: string
  link: string
  snippet: string
  date?: string
  position?: number
}

interface SearchResponse {
  results: SearchResult[]
  query: string
  type: string
  totalResults: number
  source: 'exa' | 'serper'
}

/**
 * Resolve an Exa API key from platform env or workspace env.
 * When neither is set, omit the key so `executeTool` can inject BYOK / hosted keys.
 */
async function resolveOptionalExaApiKey(
  context?: ServerToolContext
): Promise<string | undefined> {
  const platformKey = env.EXA_API_KEY
  if (typeof platformKey === 'string' && platformKey.trim().length > 0) {
    return platformKey.trim()
  }

  if (!context?.userId || !context.workspaceId) {
    return undefined
  }

  try {
    const decrypted = await getEffectiveDecryptedEnv(context.userId, context.workspaceId)
    const workspaceKey = decrypted.EXA_API_KEY
    if (typeof workspaceKey === 'string' && workspaceKey.trim().length > 0) {
      return workspaceKey.trim()
    }
  } catch {
    // Fall through — hosted/BYOK injection may still succeed.
  }

  return undefined
}

function buildToolContext(context?: ServerToolContext): Record<string, unknown> | undefined {
  if (!context?.userId && !context?.workspaceId) {
    return undefined
  }
  return {
    userId: context.userId,
    workspaceId: context.workspaceId,
    copilotToolExecution: true,
  }
}

export const searchOnlineServerTool: BaseServerTool<OnlineSearchParams, SearchResponse> = {
  name: SearchOnline.id,
  async execute(params: OnlineSearchParams, context?: ServerToolContext): Promise<SearchResponse> {
    const logger = createLogger('SearchOnlineServerTool')
    const { query, num = 10, type = 'search', gl, hl } = params
    if (!query || typeof query !== 'string') throw new Error('query is required')

    const hasSerperApiKey = Boolean(env.SERPER_API_KEY && String(env.SERPER_API_KEY).length > 0)

    logger.debug('Performing online search', {
      queryLength: query.length,
      num,
      type,
      hasWorkspaceContext: Boolean(context?.workspaceId),
    })

    // Always try Exa first — same path as the Exa block (platform key, workspace env,
    // BYOK, or hosted EXA_API_KEY_1..N). Do not gate on singular env.EXA_API_KEY alone.
    try {
      const exaApiKey = await resolveOptionalExaApiKey(context)
      const toolContext = buildToolContext(context)
      const exaParams: Record<string, unknown> = {
        query,
        numResults: num,
        type: 'auto',
        ...(exaApiKey ? { apiKey: exaApiKey } : {}),
        ...(toolContext ? { _context: toolContext } : {}),
    // Try Exa first if available
    if (hasExaApiKey) {
      try {
        const exaResult = await executeTool(
          'exa_search',
          {
            query,
            numResults: num,
            type: 'auto',
            // Exa omits page content unless it is requested, which would leave
            // every snippet empty. Highlights keep the payload small.
            highlights: true,
            apiKey: env.EXA_API_KEY ?? '',
          },
          { resolvedSecretTraceRegistry: context?.resolvedSecretTraceRegistry }
        )

        const output = exaResult.output as
          | {
              results?: Array<{
                title?: string
                url?: string
                text?: string
                summary?: string
                highlights?: string[]
                publishedDate?: string
              }>
            }
          | undefined
        const exaResults = output?.results ?? []

        if (exaResult.success && exaResults.length > 0) {
          const transformedResults: SearchResult[] = exaResults.map((result, index) => ({
            title: result.title ?? '',
            link: result.url ?? '',
            snippet: result.highlights?.join(' ') || result.text || result.summary || '',
            date: result.publishedDate,
            position: index + 1,
          }))

          return {
            results: transformedResults,
            query,
            type,
            totalResults: transformedResults.length,
            source: 'exa',
          }
        }

        logger.debug('exa_search returned no results, falling back to Serper')
      } catch (exaError) {
        const errorMessage = toError(exaError).message
        logger.warn('exa_search failed, falling back to Serper', {
          error: projectToolErrorMessageForCopilot(
            errorMessage,
            context?.resolvedSecretTraceRegistry
          ),
        })
      }

      const exaResult = await executeTool('exa_search', exaParams)

      const output = exaResult.output as
        | {
            results?: Array<{
              title?: string
              url?: string
              text?: string
              summary?: string
              publishedDate?: string
            }>
          }
        | undefined
      const exaResults = output?.results ?? []

      if (exaResult.success && exaResults.length > 0) {
        const transformedResults: SearchResult[] = exaResults.map((result, index) => ({
          title: result.title ?? '',
          link: result.url ?? '',
          snippet: result.text ?? result.summary ?? '',
          date: result.publishedDate,
          position: index + 1,
        }))

        return {
          results: transformedResults,
          query,
          type,
          totalResults: transformedResults.length,
          source: 'exa',
        }
      }

      logger.debug('exa_search returned no results, falling back to Serper')
    } catch (exaError) {
      logger.warn('exa_search failed, falling back to Serper', {
        error: toError(exaError).message,
      })
    }

    if (!hasSerperApiKey) {
      throw new Error(
        'No search API keys available. Configure Exa (workspace EXA_API_KEY, BYOK, or hosted EXA_API_KEY_1..N) or SERPER_API_KEY. Prefer invoke_integration_tool with toolId "exa_answer" or "exa_search" for live data.'
      )
    }

    const toolParams = {
      query,
      num,
      type,
      gl,
      hl,
      apiKey: env.SERPER_API_KEY ?? '',
    }

    const result = await executeTool('serper_search', toolParams, {
      resolvedSecretTraceRegistry: context?.resolvedSecretTraceRegistry,
    })
    const output = result.output as { searchResults?: SearchResult[] } | undefined
    const results = output?.searchResults ?? []

    if (!result.success) {
      const errorMsg = (result as { error?: string }).error ?? 'Search failed'
      throw new Error(errorMsg)
    }

    return {
      results,
      query,
      type,
      totalResults: results.length,
      source: 'serper',
    }
  },
}

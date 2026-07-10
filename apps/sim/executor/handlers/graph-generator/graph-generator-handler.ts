import { db } from '@sim/db'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { eq } from 'drizzle-orm'
import {
  buildGraphGeneratorUserPrompt,
  GRAPH_GENERATOR_DEFAULT_SYSTEM_PROMPT,
  GRAPH_GENERATOR_DEFAULT_USER_PROMPT_TEMPLATE,
} from '@/lib/chart-generation/graph-generator-prompts'
import { normalizeChartOutput } from '@/lib/chart-generation/normalize-chart-output'
import { validateModelProvider } from '@/ee/access-control/utils/permission-check'
import { BlockType, DEFAULTS, GRAPH_GENERATOR } from '@/executor/constants'
import type { BlockHandler, ExecutionContext } from '@/executor/types'
import { buildAPIUrl, buildAuthHeaders, extractAPIErrorMessage } from '@/executor/utils/http'
import { isJSONString, parseJSON, stringifyJSON } from '@/executor/utils/json'
import { resolveVertexCredential } from '@/executor/utils/vertex-credential'
import { calculateCost, getProviderFromModel } from '@/providers/utils'
import type { SerializedBlock } from '@/serializer/types'

const logger = createLogger('GraphGeneratorBlockHandler')

async function fetchPromptConfig(key: string): Promise<string | null> {
  try {
    const { promptConfig } = await import('@sim/db/schema')

    const rows = await db
      .select({ prompt: promptConfig.prompt })
      .from(promptConfig)
      .where(eq(promptConfig.key, key))
      .limit(1)

    if (rows.length > 0 && rows[0].prompt) {
      return rows[0].prompt
    }
  } catch (error) {
    logger.warn('Failed to fetch graph generator prompt from prompt_config table', { key, error })
  }

  return null
}

function formatInputData(data: unknown): string {
  if (typeof data === 'string') {
    if (isJSONString(data)) {
      const parsed = parseJSON(data, null)
      if (parsed) {
        return stringifyJSON(parsed)
      }
    }
    return data
  }

  if (data && typeof data === 'object') {
    return stringifyJSON(data)
  }

  return String(data ?? '')
}

/**
 * Handler for Graph Generator blocks that produce ECharts option JSON from data.
 */
export class GraphGeneratorBlockHandler implements BlockHandler {
  canHandle(block: SerializedBlock): boolean {
    return block.metadata?.id === BlockType.GRAPH_GENERATOR
  }

  async execute(
    ctx: ExecutionContext,
    block: SerializedBlock,
    inputs: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const model = typeof inputs.model === 'string' ? inputs.model : GRAPH_GENERATOR.DEFAULT_MODEL

    await validateModelProvider(ctx.userId, ctx.workspaceId, model, ctx)

    const providerId = getProviderFromModel(model)

    let finalApiKey: string | undefined =
      typeof inputs.apiKey === 'string' ? inputs.apiKey : undefined
    if (providerId === 'vertex' && typeof inputs.vertexCredential === 'string') {
      finalApiKey = await resolveVertexCredential(
        inputs.vertexCredential,
        ctx.userId,
        'vertex-graph-generator'
      )
    }

    const { PROMPT_CONFIG_KEYS } = await import('@sim/db/constants')

    const systemPrompt =
      (await fetchPromptConfig(PROMPT_CONFIG_KEYS.GRAPH_GENERATOR_SYSTEM_PROMPT)) ??
      GRAPH_GENERATOR_DEFAULT_SYSTEM_PROMPT

    const userPromptTemplate =
      (await fetchPromptConfig(PROMPT_CONFIG_KEYS.GRAPH_GENERATOR_USER_PROMPT)) ??
      GRAPH_GENERATOR_DEFAULT_USER_PROMPT_TEMPLATE

    const userInput = typeof inputs.userInput === 'string' ? inputs.userInput : String(inputs.userInput ?? '')
    const formattedData = formatInputData(inputs.data)
    const userMessage = buildGraphGeneratorUserPrompt(userPromptTemplate, userInput, formattedData)

    try {
      const url = buildAPIUrl('/api/providers', ctx.userId ? { userId: ctx.userId } : {})

      const providerRequest: Record<string, unknown> = {
        provider: providerId,
        model,
        systemPrompt,
        context: stringifyJSON([{ role: 'user', content: userMessage }]),
        temperature: GRAPH_GENERATOR.DEFAULT_TEMPERATURE,
        apiKey: finalApiKey,
        azureEndpoint: inputs.azureEndpoint,
        azureApiVersion: inputs.azureApiVersion,
        vertexProject: inputs.vertexProject,
        vertexLocation: inputs.vertexLocation,
        bedrockAccessKeyId: inputs.bedrockAccessKeyId,
        bedrockSecretKey: inputs.bedrockSecretKey,
        bedrockRegion: inputs.bedrockRegion,
        workflowId: ctx.workflowId,
        workspaceId: ctx.workspaceId,
      }

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: await buildAuthHeaders(ctx.userId),
        body: stringifyJSON(providerRequest),
      })

      if (!response.ok) {
        const errorMessage = await extractAPIErrorMessage(response)
        throw new Error(errorMessage)
      }

      const result = await response.json()
      const rawContent = typeof result.content === 'string' ? result.content : String(result.content ?? '')
      const normalized = normalizeChartOutput(rawContent)

      const inputTokens = result.tokens?.input || result.tokens?.prompt || DEFAULTS.TOKENS.PROMPT
      const outputTokens =
        result.tokens?.output || result.tokens?.completion || DEFAULTS.TOKENS.COMPLETION

      const costCalculation = calculateCost(result.model ?? model, inputTokens, outputTokens, false)

      return {
        charts: normalized.charts,
        count: normalized.count,
        content: normalized.content,
        model: result.model ?? model,
        tokens: {
          input: inputTokens,
          output: outputTokens,
          total: result.tokens?.total || DEFAULTS.TOKENS.TOTAL,
        },
        cost: {
          input: costCalculation.input,
          output: costCalculation.output,
          total: costCalculation.total,
        },
      }
    } catch (error) {
      logger.error('Graph Generator execution failed', { error: toError(error) })
      throw error
    }
  }
}

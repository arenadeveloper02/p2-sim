import { createLogger } from '@sim/logger'
import { CHART_GENERATOR_DEFAULT_MODEL } from '@/lib/chart-generation/chart-generator-config'
import {
  buildChartGeneratorUserPrompt,
  DEFAULT_CHART_GENERATOR_SYSTEM_PROMPT,
} from '@/lib/chart-generation/chart-generator-prompts'
import { normalizeChartOutput } from '@/lib/chart-generation/normalize-chart-output'
import { buildChartSkillsPromptSection } from '@/lib/chart-generation/resolve-chart-skills'
import {
  validateModelProvider,
  validateSkillsAllowed,
} from '@/ee/access-control/utils/permission-check'
import { DEFAULTS } from '@/executor/constants'
import type { SkillInput } from '@/executor/handlers/agent/types'
import type { ExecutionContext } from '@/executor/types'
import { buildAPIUrl, buildAuthHeaders, extractAPIErrorMessage } from '@/executor/utils/http'
import { stringifyJSON } from '@/executor/utils/json'
import { resolveVertexCredential } from '@/executor/utils/vertex-credential'
import { calculateCost, getProviderFromModel } from '@/providers/utils'

const logger = createLogger('RunChartGenerate')

/**
 * Minimal execution context needed to generate a chart. The block handler passes
 * its full ExecutionContext (via `executionContext`) so EE permission checks keep
 * their existing behavior; the agent tool path passes only userId/workspaceId/
 * workflowId resolved from the tool `_context`.
 */
export interface RunChartGenerateContext {
  userId?: string
  workspaceId?: string
  workflowId?: string
  executionContext?: ExecutionContext
}

/** Full output shape shared by the standalone block and the agent tool. */
export interface ChartGenerateResult {
  charts: unknown[]
  count: number
  valid: boolean
  skipped: boolean
  dashboard: { charts: unknown[]; count: number }
  content: string
  model: string
  tokens: { input: number; output: number; total: number }
  cost: { input: number; output: number; total: number }
}

function formatDataInput(data: unknown): string {
  if (data == null) return ''
  if (typeof data === 'string') return data
  try {
    return JSON.stringify(data, null, 2)
  } catch {
    return String(data)
  }
}

/**
 * Runs the LLM chart-generation flow: builds prompts (with the intent gate that
 * decides text vs chart vs both), calls the provider, and normalizes the result
 * into the `{ charts, count, valid, skipped, dashboard, content, ... }` shape.
 *
 * Shared by ChartGeneratorBlockHandler (canvas/standalone block) and the
 * `chart_generate` agent tool so both behave identically.
 */
export async function runChartGenerate(
  inputs: Record<string, unknown>,
  ctx: RunChartGenerateContext
): Promise<ChartGenerateResult> {
  const model = String(inputs.model || CHART_GENERATOR_DEFAULT_MODEL)
  await validateModelProvider(ctx.userId, ctx.workspaceId, model, ctx.executionContext)

  const providerId = getProviderFromModel(model)
  let apiKey = inputs.apiKey as string | undefined
  if (providerId === 'vertex' && inputs.vertexCredential) {
    apiKey = await resolveVertexCredential(
      String(inputs.vertexCredential),
      ctx.userId,
      'vertex-chart-generator'
    )
  }

  const userRequest = String(inputs.userRequest || '')
  const data = formatDataInput(inputs.data)

  // Workflows saved with older block versions baked stale defaults into these
  // fields: a userPrompt containing literal <userRequest>/<data> placeholders
  // (which sent the LLM empty inputs) and an outdated system prompt. Ignore
  // both so the backend defaults and real runtime inputs are used instead.
  const savedSystemPrompt = String(inputs.systemPrompt || '').trim()
  let systemPrompt =
    !savedSystemPrompt || savedSystemPrompt.startsWith('You are a chart generation assistant.')
      ? DEFAULT_CHART_GENERATOR_SYSTEM_PROMPT
      : savedSystemPrompt

  const savedUserPrompt = String(inputs.userPrompt || '').trim()
  const userPrompt =
    !savedUserPrompt || /<userRequest>|<data>/.test(savedUserPrompt)
      ? buildChartGeneratorUserPrompt(userRequest, data)
      : savedUserPrompt

  const skillInputs = (inputs.skills as SkillInput[] | undefined) ?? []
  if (skillInputs.length > 0 && ctx.workspaceId) {
    await validateSkillsAllowed(ctx.userId, ctx.workspaceId, ctx.executionContext)
    const skillsSection = await buildChartSkillsPromptSection(skillInputs, ctx.workspaceId)
    if (skillsSection) systemPrompt += skillsSection
  }

  try {
    const url = buildAPIUrl('/api/providers', ctx.userId ? { userId: ctx.userId } : {})
    const providerRequest: Record<string, unknown> = {
      provider: providerId,
      model,
      systemPrompt,
      context: stringifyJSON([{ role: 'user', content: userPrompt }]),
      temperature: inputs.temperature ?? 0.2,
      apiKey,
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
    const normalized = normalizeChartOutput(result.content, { allowPlainTextSkip: true })

    const inputTokens = result.tokens?.input || result.tokens?.prompt || DEFAULTS.TOKENS.PROMPT
    const outputTokens =
      result.tokens?.output || result.tokens?.completion || DEFAULTS.TOKENS.COMPLETION
    const costCalculation = calculateCost(result.model, inputTokens, outputTokens, false)

    return {
      charts: normalized.charts,
      count: normalized.count,
      valid: normalized.valid,
      skipped: normalized.skipped,
      dashboard: { charts: normalized.charts, count: normalized.count },
      content:
        typeof result.content === 'string' ? result.content : stringifyJSON(result.content),
      model: result.model,
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
    logger.error('Chart generation failed', { error })
    throw error
  }
}

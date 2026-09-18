import { existsSync } from 'fs'
import { mkdir, readFile, rm, writeFile } from 'fs/promises'
import { dirname, join, relative } from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { transformJSONSchema } from '@anthropic-ai/sdk/lib/transform-json-schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage, toError } from '@sim/utils/errors'
import {
  type AgentFrontApiEndpoint,
  type AgentFrontApiInput,
  type AgentFrontCombineMode,
  normalizeAgentFrontApis,
} from '@/lib/agent-front/apis'
import {
  agentFrontLlmOutputSchema,
  buildAgentFrontSystemPrompt,
  buildAgentFrontUserPrompt,
} from '@/lib/agent-front/prompts'
import {
  type AgentFrontUiMode,
  buildAgentFrontScaffoldFiles,
  buildFallbackPreviewHtml,
} from '@/lib/agent-front/scaffold'
import { createAnthropicMessage } from '@/lib/anthropic/create-message'
import type { ModelUsageByModel } from '@/lib/billing/core/record-model-usage'
import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { findMonorepoRoot, getGeneratedAppDir } from '@/lib/development/generated-apps-paths'
import { supportsTemperature } from '@/providers/utils'

const logger = createLogger('AgentFrontGenerator')

const DEFAULT_MODEL = 'claude-sonnet-4-6'
const DEFAULT_MAX_OUTPUT_TOKENS = 16_000

export interface GenerateAgentFrontAppParams {
  userInput: string
  uiMode?: AgentFrontUiMode
  combineMode?: AgentFrontCombineMode
  repoName?: string
  api1Name?: string
  api1Curl?: string
  api1Key?: string
  api2Name?: string
  api2Curl?: string
  api2Key?: string
  api3Name?: string
  api3Curl?: string
  api3Key?: string
}

export interface GenerateAgentFrontAppResult {
  success: boolean
  error?: string
  content?: string
  appName?: string
  repoName?: string
  description?: string
  features?: string[]
  outputPath?: string
  absoluteOutputPath?: string
  fileCount?: number
  uiMode?: AgentFrontUiMode
  combineMode?: AgentFrontCombineMode
  apiCount?: number
  apis?: Array<{ name: string; slug: string; wired: boolean }>
  previewHtml?: string
  previewPath?: string
  llmUsage?: ModelUsageByModel
}

interface LlmUiSpec {
  appName: string
  description: string
  features: string[]
  pageTsx: string
  previewHtml: string
}

function getAnthropicApiKey(): string {
  try {
    return getRotatingApiKey('anthropic')
  } catch {
    throw new Error(
      'ANTHROPIC_API_KEY is not configured. Set ANTHROPIC_API_KEY or ANTHROPIC_API_KEY_1 through _3.'
    )
  }
}

function getModelId(): string {
  return process.env.AGENT_FRONT_ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL
}

function slugifyRepoName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

function collectApiInputs(params: GenerateAgentFrontAppParams): AgentFrontApiInput[] {
  return [
    { name: params.api1Name, curl: params.api1Curl, apiKey: params.api1Key },
    { name: params.api2Name, curl: params.api2Curl, apiKey: params.api2Key },
    { name: params.api3Name, curl: params.api3Curl, apiKey: params.api3Key },
  ]
}

function resolveUiMode(value: string | undefined): AgentFrontUiMode {
  return value === 'chat' ? 'chat' : 'form'
}

function resolveCombineMode(value: string | undefined): AgentFrontCombineMode {
  if (value === 'sequence' || value === 'prompt') {
    return value
  }
  return 'parallel'
}

function getMessageText(message: Anthropic.Messages.Message): string {
  const text = message.content
    .filter((block): block is Anthropic.Messages.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
  if (!text.trim()) {
    throw new Error('LLM did not return text content for Agent Front generation')
  }
  return text
}

function parseLlmUiSpec(raw: string): LlmUiSpec {
  const parsed = JSON.parse(raw) as Partial<LlmUiSpec>
  if (!parsed.appName?.trim() || !parsed.pageTsx?.trim()) {
    throw new Error('LLM response missing appName or pageTsx')
  }
  return {
    appName: parsed.appName.trim(),
    description: parsed.description?.trim() || 'Agent Front UI',
    features: Array.isArray(parsed.features)
      ? parsed.features.filter((item): item is string => typeof item === 'string')
      : [],
    pageTsx: parsed.pageTsx,
    previewHtml: parsed.previewHtml?.trim() || '',
  }
}

async function requestUiSpec(params: {
  userInput: string
  uiMode: AgentFrontUiMode
  combineMode: AgentFrontCombineMode
  apis: AgentFrontApiEndpoint[]
  existingPageTsx?: string
}): Promise<{ spec: LlmUiSpec; llmUsage?: ModelUsageByModel }> {
  const anthropic = new Anthropic({ apiKey: getAnthropicApiKey() })
  const modelId = getModelId()
  const context = {
    userInput: params.userInput,
    uiMode: params.uiMode,
    combineMode: params.combineMode,
    apis: params.apis,
    existingPageTsx: params.existingPageTsx,
  }

  const message = await createAnthropicMessage(anthropic, {
    model: modelId,
    max_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
    ...(supportsTemperature(modelId) ? { temperature: 0.2 } : {}),
    system: buildAgentFrontSystemPrompt(context),
    messages: [{ role: 'user', content: buildAgentFrontUserPrompt(context) }],
    output_config: {
      format: {
        type: 'json_schema',
        schema: transformJSONSchema(agentFrontLlmOutputSchema),
      },
    },
  })

  const usage: ModelUsageByModel | undefined =
    message.usage &&
    ((message.usage.input_tokens ?? 0) > 0 || (message.usage.output_tokens ?? 0) > 0)
      ? {
          [modelId]: {
            inputTokens: message.usage.input_tokens ?? 0,
            outputTokens: message.usage.output_tokens ?? 0,
          },
        }
      : undefined

  return { spec: parseLlmUiSpec(getMessageText(message)), llmUsage: usage }
}

async function writeFiles(
  outputDir: string,
  files: Array<{ path: string; content: string }>
): Promise<number> {
  let count = 0
  for (const file of files) {
    const fullPath = join(/* turbopackIgnore: true */ outputDir, file.path)
    await mkdir(dirname(fullPath), { recursive: true })
    await writeFile(fullPath, file.content, 'utf-8')
    count += 1
  }
  return count
}

/**
 * Generates a self-hosted Agent Front Next.js app with multi-API proxy support.
 */
export async function generateAgentFrontApp(
  params: GenerateAgentFrontAppParams
): Promise<GenerateAgentFrontAppResult> {
  try {
    const userInput = params.userInput?.trim()
    if (!userInput) {
      return { success: false, error: 'userInput is required' }
    }

    const uiMode = resolveUiMode(params.uiMode)
    const combineMode = resolveCombineMode(params.combineMode)
    const normalized = normalizeAgentFrontApis(collectApiInputs(params))
    if (normalized.error || normalized.apis.length === 0) {
      return { success: false, error: normalized.error ?? 'At least one API curl is required' }
    }
    const apis = normalized.apis

    const { spec, llmUsage } = await requestUiSpec({
      userInput,
      uiMode,
      combineMode,
      apis,
    })

    const repoName =
      slugifyRepoName(params.repoName || '') ||
      slugifyRepoName(spec.appName) ||
      `agent-front-${Date.now()}`

    const outputDir = getGeneratedAppDir(repoName)
    const monorepoRoot = findMonorepoRoot()

    if (existsSync(outputDir)) {
      await rm(outputDir, { recursive: true, force: true })
    }
    await mkdir(outputDir, { recursive: true })

    const previewHtml =
      spec.previewHtml.trim() || buildFallbackPreviewHtml(spec.appName, spec.description)
    const scaffold = buildAgentFrontScaffoldFiles({
      appName: spec.appName,
      description: spec.description,
      uiMode,
      combineMode,
      apis,
      repoName,
    })

    const files = [
      ...scaffold,
      { path: 'app/page.tsx', content: spec.pageTsx },
      { path: 'preview.html', content: previewHtml },
    ]

    const fileCount = await writeFiles(outputDir, files)
    const outputPath = relative(monorepoRoot, outputDir).replace(/\\/g, '/')
    const previewPath = `${outputPath}/preview.html`

    logger.info('Agent Front app generated', { repoName, fileCount, apiCount: apis.length })

    return {
      success: true,
      content: `Generated Agent Front app "${spec.appName}" (${uiMode}, ${apis.length} API${apis.length === 1 ? '' : 's'}) at ${outputPath}`,
      appName: spec.appName,
      repoName,
      description: spec.description,
      features: spec.features,
      outputPath,
      absoluteOutputPath: outputDir,
      fileCount,
      uiMode,
      combineMode,
      apiCount: apis.length,
      apis: apis.map((api) => ({
        name: api.name,
        slug: api.slug,
        wired: Boolean(api.apiKey),
      })),
      previewHtml,
      previewPath,
      llmUsage,
    }
  } catch (error) {
    logger.error('Agent Front generate failed', { error: getErrorMessage(error) })
    return { success: false, error: getErrorMessage(error, 'Failed to generate Agent Front app') }
  }
}

/**
 * Edits an existing Agent Front app (page + preview + API wiring).
 */
export async function editAgentFrontApp(
  params: GenerateAgentFrontAppParams & { repoName: string }
): Promise<GenerateAgentFrontAppResult> {
  try {
    const userInput = params.userInput?.trim()
    const repoName = slugifyRepoName(params.repoName)
    if (!userInput) {
      return { success: false, error: 'userInput is required' }
    }
    if (!repoName) {
      return { success: false, error: 'repoName is required' }
    }

    const outputDir = getGeneratedAppDir(repoName)
    if (!existsSync(outputDir)) {
      return { success: false, error: `Generated app not found: ${repoName}` }
    }

    const uiMode = resolveUiMode(params.uiMode)
    const combineMode = resolveCombineMode(params.combineMode)
    const normalized = normalizeAgentFrontApis(collectApiInputs(params))
    if (normalized.error || normalized.apis.length === 0) {
      return { success: false, error: normalized.error ?? 'At least one API curl is required' }
    }
    const apis = normalized.apis

    const pagePath = join(/* turbopackIgnore: true */ outputDir, 'app', 'page.tsx')
    const existingPageTsx = existsSync(pagePath) ? await readFile(pagePath, 'utf-8') : undefined

    const { spec, llmUsage } = await requestUiSpec({
      userInput,
      uiMode,
      combineMode,
      apis,
      existingPageTsx,
    })

    const monorepoRoot = findMonorepoRoot()
    const previewHtml =
      spec.previewHtml.trim() || buildFallbackPreviewHtml(spec.appName, spec.description)
    const scaffold = buildAgentFrontScaffoldFiles({
      appName: spec.appName,
      description: spec.description,
      uiMode,
      combineMode,
      apis,
      repoName,
    })

    const files = [
      ...scaffold,
      { path: 'app/page.tsx', content: spec.pageTsx },
      { path: 'preview.html', content: previewHtml },
    ]

    const fileCount = await writeFiles(outputDir, files)
    const outputPath = relative(monorepoRoot, outputDir).replace(/\\/g, '/')
    const previewPath = `${outputPath}/preview.html`

    logger.info('Agent Front app edited', { repoName, fileCount, apiCount: apis.length })

    return {
      success: true,
      content: `Updated Agent Front app "${spec.appName}" (${uiMode}, ${apis.length} API${apis.length === 1 ? '' : 's'}) at ${outputPath}`,
      appName: spec.appName,
      repoName,
      description: spec.description,
      features: spec.features,
      outputPath,
      absoluteOutputPath: outputDir,
      fileCount,
      uiMode,
      combineMode,
      apiCount: apis.length,
      apis: apis.map((api) => ({
        name: api.name,
        slug: api.slug,
        wired: Boolean(api.apiKey),
      })),
      previewHtml,
      previewPath,
      llmUsage,
    }
  } catch (error) {
    logger.error('Agent Front edit failed', { error: getErrorMessage(toError(error)) })
    return { success: false, error: getErrorMessage(error, 'Failed to edit Agent Front app') }
  }
}

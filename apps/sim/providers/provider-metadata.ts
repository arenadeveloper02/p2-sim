import type { ComponentType } from 'react'
import { createLogger } from '@sim/logger'
import { formatCreditCost } from '@/lib/billing/credits/conversion'
import { env } from '@/lib/core/config/env'
import { getBlacklistedProvidersFromEnv } from '@/lib/core/config/env-flags'
import {
  getComputerUseModels,
  getHostedModels as getHostedModelsFromDefinitions,
  getMaxOutputTokensForModel as getMaxOutputTokensForModelFromDefinitions,
  getMaxTemperature as getMaxTempFromDefinitions,
  getModelsWithDeepResearch,
  getModelsWithoutMemory,
  getModelsWithPromptCaching,
  getModelsWithReasoningEffort,
  getModelsWithTemperatureRange,
  getModelsWithTemperatureSupport,
  getModelsWithThinking,
  getModelsWithVerbosity,
  getProviderDefaultModel as getProviderDefaultModelFromDefinitions,
  getProviderModels as getProviderModelsFromDefinitions,
  getProvidersWithToolUsageControl,
  getReasoningEffortValuesForModel as getReasoningEffortValuesForModelFromDefinitions,
  getThinkingLevelsForModel as getThinkingLevelsForModelFromDefinitions,
  getVerbosityValuesForModel as getVerbosityValuesForModelFromDefinitions,
  isKnownModelLevelValue,
  PROVIDER_DEFINITIONS,
  supportsTemperature as supportsTemperatureFromDefinitions,
  supportsToolUsageControl as supportsToolUsageControlFromDefinitions,
  updateOllamaModels as updateOllamaModelsInDefinitions,
} from '@/providers/models'
import type { ProviderId } from '@/providers/types'

const logger = createLogger('ProviderMetadata')

/**
 * Client-safe provider metadata.
 * This object contains only model lists and patterns - no executeRequest implementations.
 * For server-side execution, use @/providers/registry.
 */
export interface ProviderMetadata {
  id: string
  name: string
  description: string
  version: string
  models: string[]
  defaultModel: string
  computerUseModels?: string[]
  modelPatterns?: RegExp[]
}

/**
 * Build provider metadata from PROVIDER_DEFINITIONS.
 * This is client-safe as it doesn't import any provider implementations.
 */
function buildProviderMetadata(providerId: ProviderId): ProviderMetadata {
  const def = PROVIDER_DEFINITIONS[providerId]
  return {
    id: providerId,
    name: def?.name || providerId,
    description: def?.description || '',
    version: '1.0.0',
    models: getProviderModelsFromDefinitions(providerId),
    defaultModel: getProviderDefaultModelFromDefinitions(providerId),
    modelPatterns: def?.modelPatterns,
  }
}

export const providers: Record<ProviderId, ProviderMetadata> = {
  ollama: buildProviderMetadata('ollama'),
  'ollama-cloud': buildProviderMetadata('ollama-cloud'),
  vllm: buildProviderMetadata('vllm'),
  litellm: buildProviderMetadata('litellm'),
  openai: {
    ...buildProviderMetadata('openai'),
    computerUseModels: ['computer-use-preview'],
  },
  anthropic: {
    ...buildProviderMetadata('anthropic'),
    computerUseModels: getComputerUseModels().filter((model) =>
      getProviderModelsFromDefinitions('anthropic').includes(model)
    ),
  },
  sambanova: buildProviderMetadata('sambanova'),
  google: buildProviderMetadata('google'),
  vertex: buildProviderMetadata('vertex'),
  'azure-openai': buildProviderMetadata('azure-openai'),
  'azure-anthropic': buildProviderMetadata('azure-anthropic'),
  deepseek: buildProviderMetadata('deepseek'),
  xai: buildProviderMetadata('xai'),
  cerebras: buildProviderMetadata('cerebras'),
  groq: buildProviderMetadata('groq'),
  sakana: buildProviderMetadata('sakana'),
  nvidia: buildProviderMetadata('nvidia'),
  meta: buildProviderMetadata('meta'),
  zai: buildProviderMetadata('zai'),
  kimi: buildProviderMetadata('kimi'),
  mistral: buildProviderMetadata('mistral'),
  bedrock: buildProviderMetadata('bedrock'),
  openrouter: buildProviderMetadata('openrouter'),
  fireworks: buildProviderMetadata('fireworks'),
  together: buildProviderMetadata('together'),
  baseten: buildProviderMetadata('baseten'),
}

export function updateOllamaProviderModels(models: string[]): void {
  updateOllamaModelsInDefinitions(models)
  providers.ollama.models = getProviderModelsFromDefinitions('ollama')
}

export function updateVLLMProviderModels(models: string[]): void {
  const { updateVLLMModels } = require('@/providers/models')
  updateVLLMModels(models)
  providers.vllm.models = getProviderModelsFromDefinitions('vllm')
}

export function updateLiteLLMProviderModels(models: string[]): void {
  const { updateLiteLLMModels } = require('@/providers/models')
  updateLiteLLMModels(models)
  providers.litellm.models = getProviderModelsFromDefinitions('litellm')
}

export async function updateOpenRouterProviderModels(models: string[]): Promise<void> {
  const { updateOpenRouterModels } = await import('@/providers/models')
  updateOpenRouterModels(models)
  providers.openrouter.models = getProviderModelsFromDefinitions('openrouter')
}

export async function updateFireworksProviderModels(models: string[]): Promise<void> {
  const { updateFireworksModels } = await import('@/providers/models')
  updateFireworksModels(models)
  providers.fireworks.models = getProviderModelsFromDefinitions('fireworks')
}

export async function updateOllamaCloudProviderModels(models: string[]): Promise<void> {
  const { updateOllamaCloudModels } = await import('@/providers/models')
  updateOllamaCloudModels(models)
  providers['ollama-cloud'].models = getProviderModelsFromDefinitions('ollama-cloud')
}

export async function updateTogetherProviderModels(models: string[]): Promise<void> {
  const { updateTogetherModels } = await import('@/providers/models')
  updateTogetherModels(models)
  providers.together.models = getProviderModelsFromDefinitions('together')
}

export async function updateBasetenProviderModels(models: string[]): Promise<void> {
  const { updateBasetenModels } = await import('@/providers/models')
  updateBasetenModels(models)
  providers.baseten.models = getProviderModelsFromDefinitions('baseten')
}

export function getBaseModelProviders(): Record<string, ProviderId> {
  const allProviders = Object.entries(providers)
    .filter(
      ([providerId]) =>
        providerId !== 'ollama' &&
        providerId !== 'ollama-cloud' &&
        providerId !== 'vllm' &&
        providerId !== 'litellm' &&
        providerId !== 'openrouter' &&
        providerId !== 'mistral' &&
        providerId !== 'cerebras' &&
        providerId !== 'azure-openai' &&
        providerId !== 'fireworks' &&
        providerId !== 'together' &&
        providerId !== 'baseten'
    )
    .reduce(
      (map, [providerId, config]) => {
        config.models.forEach((model) => {
          map[model.toLowerCase()] = providerId as ProviderId
        })
        return map
      },
      {} as Record<string, ProviderId>
    )

  return filterBlacklistedModelsFromProviderMap(allProviders)
}

function filterBlacklistedModelsFromProviderMap(
  providerMap: Record<string, ProviderId>
): Record<string, ProviderId> {
  const filtered: Record<string, ProviderId> = {}
  for (const [model, providerId] of Object.entries(providerMap)) {
    if (isProviderBlacklisted(providerId)) {
      continue
    }
    if (!isModelBlacklisted(model)) {
      filtered[model] = providerId
    }
  }
  return filtered
}

export function getAllModelProviders(): Record<string, ProviderId> {
  return Object.entries(providers).reduce(
    (map, [providerId, config]) => {
      config.models.forEach((model) => {
        map[model.toLowerCase()] = providerId as ProviderId
      })
      return map
    },
    {} as Record<string, ProviderId>
  )
}

/**
 * The provider that declares `model`, or `null` when none does.
 *
 * The non-guessing half of {@link getProviderFromModel}. A caller that *gates*
 * on the answer needs "unknown" to stay distinct from "ollama": this registry
 * holds chat models only, so every embedding, speech, image and video model id
 * would otherwise read as an Ollama model and be judged against an allowlist
 * that was never about it.
 */
export function findProviderFromModel(model: string): ProviderId | null {
  const normalizedModel = model.toLowerCase()

  const declared = getAllModelProviders()[normalizedModel]
  if (declared) return declared

  for (const [id, config] of Object.entries(providers)) {
    for (const pattern of config.modelPatterns ?? []) {
      if (pattern.test(normalizedModel)) return id as ProviderId
    }
  }

  return null
}

export function getProviderFromModel(model: string): ProviderId {
  const normalizedModel = model.toLowerCase()

  let providerId = findProviderFromModel(model)

  if (!providerId) {
    logger.warn(`No provider found for model: ${model}, defaulting to ollama`)
    providerId = 'ollama'
  }

  if (isProviderBlacklisted(providerId)) {
    throw new Error(`Provider "${providerId}" is not available`)
  }

  if (isModelBlacklisted(normalizedModel)) {
    throw new Error(`Model "${model}" is not available`)
  }

  return providerId
}

export function getProvider(id: string): ProviderMetadata | undefined {
  const providerId = id.split('/')[0] as ProviderId
  return providers[providerId]
}

export function getProviderConfigFromModel(model: string): ProviderMetadata | undefined {
  const providerId = getProviderFromModel(model)
  return providers[providerId]
}

export function getAllModels(): string[] {
  return Object.values(providers).flatMap((provider) => provider.models || [])
}

export function getAllProviderIds(): ProviderId[] {
  return Object.keys(providers) as ProviderId[]
}

export function getProviderModels(providerId: ProviderId): string[] {
  return getProviderModelsFromDefinitions(providerId)
}

export function isProviderBlacklisted(providerId: string): boolean {
  return getBlacklistedProvidersFromEnv().includes(providerId.toLowerCase())
}

/**
 * Get the list of blacklisted models from env var.
 * BLACKLISTED_MODELS supports:
 * - Exact model names: "gpt-4,claude-3-opus"
 * - Prefix patterns with *: "claude-*,gpt-4-*" (matches models starting with that prefix)
 */
function getBlacklistedModels(): { models: string[]; prefixes: string[] } {
  if (!env.BLACKLISTED_MODELS) return { models: [], prefixes: [] }

  const entries = env.BLACKLISTED_MODELS.split(',').map((m) => m.trim().toLowerCase())
  const models = entries.filter((e) => !e.endsWith('*'))
  const prefixes = entries.filter((e) => e.endsWith('*')).map((e) => e.slice(0, -1))

  return { models, prefixes }
}

function isModelBlacklisted(model: string): boolean {
  const lowerModel = model.toLowerCase()
  const blacklist = getBlacklistedModels()

  if (blacklist.models.includes(lowerModel)) {
    return true
  }

  if (blacklist.prefixes.some((prefix) => lowerModel.startsWith(prefix))) {
    return true
  }

  return false
}

export function filterBlacklistedModels(models: string[]): string[] {
  return models.filter((model) => !isModelBlacklisted(model))
}

export function getProviderIcon(model: string): ComponentType<{ className?: string }> | null {
  const providerId = getProviderFromModel(model)
  return PROVIDER_DEFINITIONS[providerId]?.icon || null
}

/**
 * Format cost as a credit string for display.
 * Internally cost is in USD; this converts to credits (1 USD = 200 credits).
 *
 * @param cost Cost in USD
 * @returns Formatted credit string (e.g. "200 credits", "<1 credit", "0 credits")
 */
export function formatCost(cost: number): string {
  return formatCreditCost(cost) ?? '—'
}

/**
 * Get the list of models that are hosted by the platform (don't require user API keys)
 * These are the models for which we hide the API key field in the hosted environment
 */
export function getHostedModels(): string[] {
  return getHostedModelsFromDefinitions()
}

export const MODELS_TEMP_RANGE_0_2 = getModelsWithTemperatureRange(2)
export const MODELS_TEMP_RANGE_0_15 = getModelsWithTemperatureRange(1.5)
export const MODELS_TEMP_RANGE_0_1 = getModelsWithTemperatureRange(1)
export const MODELS_WITH_TEMPERATURE_SUPPORT = getModelsWithTemperatureSupport()
export const MODELS_WITH_REASONING_EFFORT = getModelsWithReasoningEffort()
export const MODELS_WITH_VERBOSITY = getModelsWithVerbosity()
export const MODELS_WITH_THINKING = getModelsWithThinking()
export const MODELS_WITH_PROMPT_CACHING = getModelsWithPromptCaching()
export const MODELS_WITH_DEEP_RESEARCH = getModelsWithDeepResearch()
export const MODELS_WITHOUT_MEMORY = getModelsWithoutMemory()
export const PROVIDERS_WITH_TOOL_USAGE_CONTROL = getProvidersWithToolUsageControl()

export function supportsTemperature(model: string): boolean {
  return supportsTemperatureFromDefinitions(model)
}

/**
 * Levels the pickers offer on top of what a model declares. `auto` means "say nothing" and
 * `none` means "explicitly off"; provider adapters special-case both, so neither is an
 * unrecognized level.
 */
const MODEL_LEVEL_SENTINELS = new Set(['auto', 'none'])

/**
 * Renders a tuning level for a log line or an error message.
 *
 * The agent block's reasoning effort, verbosity, and thinking level fields accept variable and
 * environment references, so an unrecognized level is not necessarily a mistyped level — it is
 * whatever the reference resolved to, up to and including secret content. Only a level the
 * catalogue declares somewhere is safe to echo; anything else is reported by length alone,
 * which still distinguishes a stray level from a resolved blob.
 *
 * Every site that puts a caller-supplied level into a message must go through this.
 */
export function describeModelLevel(value: string | undefined): string {
  if (!value) return '(unset)'
  const isSafe = MODEL_LEVEL_SENTINELS.has(value) || isKnownModelLevelValue(value)
  return isSafe ? value : `[redacted ${value.length} chars]`
}

export function supportsReasoningEffort(model: string): boolean {
  return MODELS_WITH_REASONING_EFFORT.includes(model.toLowerCase())
}

export function supportsVerbosity(model: string): boolean {
  return MODELS_WITH_VERBOSITY.includes(model.toLowerCase())
}

export function supportsThinking(model: string): boolean {
  return MODELS_WITH_THINKING.includes(model.toLowerCase())
}

/** Whether the model accepts caller-placed prompt-cache breakpoints. */
export function supportsPromptCaching(model: string): boolean {
  return MODELS_WITH_PROMPT_CACHING.includes(model.toLowerCase())
}

export function isDeepResearchModel(model: string): boolean {
  return MODELS_WITH_DEEP_RESEARCH.includes(model.toLowerCase())
}

export function isGemini3Model(model: string): boolean {
  const normalized = model.toLowerCase().replace(/^vertex\//, '')
  return normalized.startsWith('gemini-3')
}

/**
 * Get the maximum temperature value for a model
 * @returns Maximum temperature value (1 or 2) or undefined if temperature not supported
 */
export function getMaxTemperature(model: string): number | undefined {
  return getMaxTempFromDefinitions(model)
}

export function supportsToolUsageControl(provider: string): boolean {
  return supportsToolUsageControlFromDefinitions(provider)
}

/**
 * Get reasoning effort values for a specific model
 * Returns the valid options for that model, or null if the model doesn't support reasoning effort
 */
export function getReasoningEffortValuesForModel(model: string): string[] | null {
  return getReasoningEffortValuesForModelFromDefinitions(model)
}

/**
 * Get verbosity values for a specific model
 * Returns the valid options for that model, or null if the model doesn't support verbosity
 */
export function getVerbosityValuesForModel(model: string): string[] | null {
  return getVerbosityValuesForModelFromDefinitions(model)
}

/**
 * Get thinking levels for a specific model
 * Returns the valid levels for that model, or null if the model doesn't support thinking
 */
export function getThinkingLevelsForModel(model: string): string[] | null {
  return getThinkingLevelsForModelFromDefinitions(model)
}

/**
 * Get max output tokens for a specific model.
 *
 * @param model - The model ID
 */
export function getMaxOutputTokensForModel(model: string): number {
  return getMaxOutputTokensForModelFromDefinitions(model)
}

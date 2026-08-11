import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { isHosted } from '@/lib/core/config/env-flags'
import {
  DEFAULT_LOCAL_COPILOT_CATALOG_ID,
  type LocalCopilotCatalogId,
  resolveLocalCopilotCatalogEntry,
} from '@/local-copilot/lib/model-catalog'
import type { LocalCopilotConfig, LocalCopilotProviderId } from '@/local-copilot/lib/types'

/** Default Local Copilot main agent model (override with `COPILOT_MODEL`). */
const DEFAULT_MODEL = 'claude-sonnet-4-6'
/**
 * Default specialist / parallel-subagent model when `COPILOT_PROVIDER=anthropic`
 * and `COPILOT_SPECIALIST_MODEL` is unset. Cheaper than Sonnet for leaf tool work.
 */
const DEFAULT_ANTHROPIC_SPECIALIST_MODEL = 'claude-haiku-4-5'
const DEFAULT_PROVIDER: LocalCopilotProviderId = 'anthropic'
const DEFAULT_BEDROCK_REGION = 'us-east-1'

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value.trim() === '') return fallback
  return value === 'true' || value === '1'
}

function resolveProvider(value: string | undefined): LocalCopilotProviderId {
  const normalized = (value ?? DEFAULT_PROVIDER).trim().toLowerCase()
  const allowed: LocalCopilotProviderId[] = [
    'openai',
    'anthropic',
    'azure-openai',
    'bedrock',
    'gemini',
    'openai-compatible',
  ]
  return allowed.includes(normalized as LocalCopilotProviderId)
    ? (normalized as LocalCopilotProviderId)
    : DEFAULT_PROVIDER
}

/**
 * Resolves the specialist model: explicit override, else Haiku for Anthropic,
 * else the main agent model.
 */
export function resolveSpecialistModel(
  provider: LocalCopilotProviderId,
  mainModel: string,
  specialistOverride?: string
): string {
  const override = specialistOverride?.trim()
  if (override) return override
  return provider === 'anthropic' ? DEFAULT_ANTHROPIC_SPECIALIST_MODEL : mainModel
}

/**
 * Reads Arena Copilot configuration from environment variables.
 * All LLM traffic goes directly to the configured provider — no Sim cloud relay.
 *
 * `COPILOT_API_KEY` authenticates requests to Sim Cloud Mothership and must not
 * be used for direct provider calls (it is typically `sk-sim-copilot-*`).
 */
function resolveApiKey(provider: LocalCopilotProviderId): string | undefined {
  if (provider === 'anthropic') {
    try {
      return getRotatingApiKey('anthropic')
    } catch {
      return undefined
    }
  }

  if (provider === 'gemini') {
    try {
      return getRotatingApiKey('gemini')
    } catch {
      return (
        process.env.GOOGLE_API_KEY?.trim() ||
        process.env.NEXT_PUBLIC_GOOGLE_API_KEY?.trim() ||
        undefined
      )
    }
  }

  if (provider === 'openai' || provider === 'openai-compatible') {
    return (
      process.env.OPENAI_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY_1?.trim() ||
      process.env.OPENAI_API_KEY_2?.trim() ||
      process.env.OPENAI_API_KEY_3?.trim() ||
      undefined
    )
  }

  return undefined
}

function resolveBedrockRegion(): string {
  return (
    process.env.AWS_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim() ||
    DEFAULT_BEDROCK_REGION
  )
}

function hasBedrockCredentials(): boolean {
  const accessKey = process.env.AWS_ACCESS_KEY_ID?.trim()
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY?.trim()
  if (accessKey && secretKey) return true
  // Default credential chain (instance role, profile, etc.) may still work.
  return Boolean(
    process.env.AWS_PROFILE?.trim() || process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI
  )
}

export function getLocalCopilotConfig(): LocalCopilotConfig {
  const provider = resolveProvider(process.env.COPILOT_PROVIDER)
  const model = process.env.COPILOT_MODEL?.trim() || DEFAULT_MODEL
  const specialistModel = resolveSpecialistModel(
    provider,
    model,
    process.env.COPILOT_SPECIALIST_MODEL
  )

  return {
    enabled: parseBoolean(process.env.COPILOT_ENABLED, true),
    provider,
    model,
    specialistModel,
    apiKey: resolveApiKey(provider),
    baseUrl: process.env.COPILOT_BASE_URL?.trim() || undefined,
    region: provider === 'bedrock' ? resolveBedrockRegion() : undefined,
  }
}

/**
 * Builds a per-request Local Copilot config from an allowlisted catalog id.
 * Does not mutate process-wide env defaults.
 */
export function buildLocalCopilotConfigForCatalog(
  catalogId: LocalCopilotCatalogId = DEFAULT_LOCAL_COPILOT_CATALOG_ID
): LocalCopilotConfig {
  const base = getLocalCopilotConfig()
  const entry = resolveLocalCopilotCatalogEntry(catalogId)
  const model =
    entry.model?.trim() ||
    (entry.provider === 'anthropic' ? process.env.COPILOT_MODEL?.trim() || DEFAULT_MODEL : entry.id)
  const specialistModel = resolveSpecialistModel(
    entry.provider,
    model,
    entry.provider === 'anthropic' ? process.env.COPILOT_SPECIALIST_MODEL : undefined
  )

  return {
    enabled: base.enabled,
    provider: entry.provider,
    model,
    specialistModel,
    apiKey: resolveApiKey(entry.provider),
    baseUrl: entry.provider === base.provider ? base.baseUrl : undefined,
    region: entry.provider === 'bedrock' ? resolveBedrockRegion() : undefined,
  }
}

export function assertLocalCopilotEnabled(
  config: LocalCopilotConfig = getLocalCopilotConfig()
): void {
  if (!config.enabled) {
    throw new Error('Arena Copilot is disabled. Set COPILOT_ENABLED=true to enable.')
  }

  if (config.provider === 'bedrock') {
    if (!hasBedrockCredentials() && !process.env.AWS_ACCESS_KEY_ID) {
      // Allow default chain; fail at request time if AWS cannot resolve credentials.
      return
    }
    return
  }

  if (config.provider === 'openai-compatible') {
    return
  }

  if (!config.apiKey) {
    if (config.provider === 'anthropic') {
      throw new Error(
        'Claude is not configured on this server. Set ANTHROPIC_API_KEY or ANTHROPIC_API_KEY_1 through _3 (not COPILOT_API_KEY).'
      )
    }
    if (config.provider === 'gemini') {
      throw new Error(
        'Gemini is not configured on this server. Set GEMINI_API_KEY (or GOOGLE_API_KEY).'
      )
    }
    throw new Error(
      `Arena Copilot requires an API key for the configured provider (${config.provider}).`
    )
  }
}

export function isSelfHostedDeployment(): boolean {
  return !isHosted
}

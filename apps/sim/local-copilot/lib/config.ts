import { getRotatingApiKey } from '@/lib/core/config/api-keys'
import { isHosted } from '@/lib/core/config/env-flags'
import { isEmailAllowed } from '@/lib/core/security/deployment'
import type { LocalCopilotConfig, LocalCopilotProviderId } from '@/local-copilot/lib/types'

/** Latest Claude model registered in `@/providers/models`. */
const DEFAULT_MODEL = 'claude-opus-4-8'
const DEFAULT_PROVIDER: LocalCopilotProviderId = 'anthropic'

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

/**
 * Parses `COPILOT_ALLOWED_EMAILS` — comma-separated exact emails or `@domain` entries.
 */
export function getLocalCopilotAllowedEmails(): string[] {
  const raw = process.env.COPILOT_ALLOWED_EMAILS?.trim()
  if (!raw) return []
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

/**
 * When `COPILOT_ALLOWED_EMAILS` is unset, all users may use local copilot (if enabled).
 * When set, only listed emails/domains may use local copilot; everyone else uses Mothership.
 */
export function isUserAllowedForLocalCopilot(userEmail: string | undefined | null): boolean {
  const config = getLocalCopilotConfig()
  if (!config.enabled) return false

  const allowedEmails = getLocalCopilotAllowedEmails()
  if (allowedEmails.length === 0) return true

  if (!userEmail?.trim()) return false
  return isEmailAllowed(userEmail, allowedEmails)
}

export function getLocalCopilotConfig(): LocalCopilotConfig {
  const provider = resolveProvider(process.env.COPILOT_PROVIDER)
  return {
    enabled: parseBoolean(process.env.COPILOT_ENABLED, true),
    provider,
    model: process.env.COPILOT_MODEL?.trim() || DEFAULT_MODEL,
    apiKey: resolveApiKey(provider),
    baseUrl: process.env.COPILOT_BASE_URL?.trim() || undefined,
  }
}

export function assertLocalCopilotEnabled(config: LocalCopilotConfig = getLocalCopilotConfig()): void {
  if (!config.enabled) {
    throw new Error('Arena Copilot is disabled. Set COPILOT_ENABLED=true to enable.')
  }
  if (!config.apiKey && config.provider !== 'openai-compatible') {
    const hint =
      config.provider === 'anthropic'
        ? 'Set ANTHROPIC_API_KEY or ANTHROPIC_API_KEY_1 through _3 (not COPILOT_API_KEY).'
        : 'Set OPENAI_API_KEY or OPENAI_API_KEY_1.'
    throw new Error(`Arena Copilot requires an API key for the configured provider. ${hint}`)
  }
}

export function isSelfHostedDeployment(): boolean {
  return !isHosted
}

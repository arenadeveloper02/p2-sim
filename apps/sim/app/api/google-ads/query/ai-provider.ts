import { getApiKey } from '@/providers/utils'

type Logger = {
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  error: (message: string, meta?: Record<string, unknown>) => void
}

export type ProviderName = 'xai' | 'anthropic' | 'openai'

export interface ProviderSelection {
  provider: ProviderName
  model: string
  apiKey: string
}

const PROVIDER_PRIORITY: Array<{
  provider: ProviderName
  model: string
  label: string
}> = [
  {
    provider: 'xai',
    model: 'grok-3-fast-latest',
    label: 'Grok',
  },
  {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    label: 'Claude',
  },
  {
    provider: 'openai',
    model: 'gpt-4o',
    label: 'OpenAI',
  },
]

export function resolveProvider(logger: Logger): ProviderSelection {
  const errors: Record<string, unknown> = {}

  for (const candidate of PROVIDER_PRIORITY) {
    try {
      const apiKey = getApiKey(candidate.provider, candidate.model)
      logger.info(`Using ${candidate.label} for query parsing`, {
        model: candidate.model,
        provider: candidate.provider,
      })
      return { provider: candidate.provider, model: candidate.model, apiKey }
    } catch (error) {
      errors[candidate.provider] = error
      logger.warn(`${candidate.label} API key not available, falling back`, {
        provider: candidate.provider,
        model: candidate.model,
        error,
      })
    }
  }

  logger.error('No AI provider available', { errors })
  throw new Error('No AI API key available (tried Grok, Claude, and OpenAI)')
}


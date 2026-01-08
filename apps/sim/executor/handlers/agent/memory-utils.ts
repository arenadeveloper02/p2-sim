import { createLogger } from '@sim/logger'
import { PROVIDER_DEFINITIONS } from '@/providers/models'

const logger = createLogger('MemoryUtils')

/**
 * Token limit configuration for memory management
 * Uses a percentage of context window to leave room for:
 * - System prompts
 * - Response generation
 * - Other messages in the conversation
 */
const MEMORY_TOKEN_BUFFER_RATIO = 0.6 // Use 60% of context window for memory (20% buffer)

/**
 * Default token limit when model context window is unknown
 * Conservative default to prevent token overflow
 */
const DEFAULT_TOKEN_LIMIT = 32000 // 32k tokens default

/**
 * Get the maximum token limit for memory content based on model's context window
 * Returns a safe limit that leaves buffer for system prompts and responses
 *
 * @param model - Model identifier (e.g., 'gpt-4o', 'claude-3-opus')
 * @returns Token limit for memory content, or default if model context window is unknown
 */
export function getMemoryTokenLimit(model?: string): number {
  if (!model) {
    logger.debug('No model provided, using default token limit', {
      defaultLimit: DEFAULT_TOKEN_LIMIT,
    })
    return DEFAULT_TOKEN_LIMIT
  }

  let contextWindow: number | undefined

  // Search through provider definitions to find model's context window
  for (const provider of Object.values(PROVIDER_DEFINITIONS)) {
    if (provider.contextInformationAvailable === false) {
      continue
    }

    const matchesPattern = provider.modelPatterns?.some((pattern) => pattern.test(model))
    const matchesModel = provider.models.some((m) => m.id === model)

    if (matchesPattern || matchesModel) {
      const modelDef = provider.models.find((m) => m.id === model)
      if (modelDef?.contextWindow) {
        contextWindow = modelDef.contextWindow
        break
      }
    }
  }

  if (!contextWindow) {
    logger.debug('No context window information available for model, using default', {
      model,
      defaultLimit: DEFAULT_TOKEN_LIMIT,
    })
    return DEFAULT_TOKEN_LIMIT
  }

  // Calculate safe token limit (80% of context window)
  const tokenLimit = Math.floor(contextWindow * MEMORY_TOKEN_BUFFER_RATIO)

  logger.debug('Calculated memory token limit for model', {
    model,
    contextWindow,
    tokenLimit,
    bufferRatio: MEMORY_TOKEN_BUFFER_RATIO,
  })

  return tokenLimit
}

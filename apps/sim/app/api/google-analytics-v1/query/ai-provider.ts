/**
 * AI provider resolution for Google Analytics v1
 */

import type { Logger } from '@sim/logger'
import type { AIProviderConfig } from './types'

/**
 * Resolves AI provider with Grok first, then GPT-4o fallback
 *
 * Priority order:
 * 1. Grok (XAI) - grok-3-fast-latest
 * 2. GPT-4o (OpenAI) - gpt-4o
 *
 * @param logger - Logger instance
 * @returns Provider configuration
 * @throws Error if no provider is available
 */
export function resolveAIProvider(logger: Logger): AIProviderConfig {
  // Try Grok first
  if (process.env.XAI_API_KEY) {
    logger.info('Using Grok for Google Analytics query generation')
    return {
      provider: 'xai' as const,
      model: 'grok-3-fast-latest',
      apiKey: process.env.XAI_API_KEY,
    }
  }

  // Fallback to GPT-4o
  if (process.env.OPENAI_API_KEY) {
    logger.info('Using GPT-4o for Google Analytics query generation (Grok not available)')
    return {
      provider: 'openai' as const,
      model: 'gpt-4o',
      apiKey: process.env.OPENAI_API_KEY,
    }
  }

  throw new Error('No AI provider available. Please set XAI_API_KEY or OPENAI_API_KEY')
}

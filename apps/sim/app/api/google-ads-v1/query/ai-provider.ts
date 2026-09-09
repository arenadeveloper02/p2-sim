/**
 * AI provider resolution for Google Ads V1
 */

import type { Logger } from '@sim/logger'
import type { AIProviderConfig } from './types'

/**
 * Resolves AI provider with Claude Haiku 4.5 first, then GPT / Gemini fallbacks
 *
 * Priority order:
 * 1. Claude Haiku 4.5 (Anthropic) - claude-haiku-4-5
 * 2. GPT-5.5 (OpenAI) - gpt-5.5
 * 3. Gemini (Google) - gemini-3.1-pro-preview
 *
 * @param logger - Logger instance
 * @returns Provider configuration
 * @throws Error if no provider is available
 */
export function resolveAIProvider(logger: Logger): AIProviderConfig {
  if (process.env.ANTHROPIC_API_KEY) {
    logger.info('Using Claude Haiku 4.5 for GAQL generation')
    return {
      provider: 'anthropic' as const,
      model: 'claude-haiku-4-5',
      apiKey: process.env.ANTHROPIC_API_KEY,
    }
  }

  if (process.env.OPENAI_API_KEY) {
    logger.info('Using GPT-5.5 for GAQL generation (Claude Haiku not available)')
    return {
      provider: 'openai' as const,
      model: 'gpt-5.5',
      apiKey: process.env.OPENAI_API_KEY,
    }
  }

  if (process.env.GOOGLE_API_KEY) {
    logger.info('Using Google Gemini for GAQL generation (Claude Haiku and GPT not available)')
    return {
      provider: 'google' as const,
      model: 'gemini-3.1-pro-preview',
      apiKey: process.env.GOOGLE_API_KEY,
    }
  }

  throw new Error(
    'No AI provider available. Please set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY'
  )
}

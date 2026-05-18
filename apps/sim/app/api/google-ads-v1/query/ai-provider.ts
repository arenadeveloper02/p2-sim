/**
 * AI provider resolution for Google Ads V1
 */

import type { Logger } from '@sim/logger'
import type { AIProviderConfig } from './types'

/**
 * Resolves AI provider with GPT-5.5 first, then Claude fallback, then Gemini
 *
 * Priority order:
 * 1. GPT-5.5 (OpenAI) - gpt-5.5
 * 2. Claude 4.7 Opus (Anthropic) - claude-opus-4-7
 * 3. Gemini (Google) - gemini-3.1-pro-preview
 *
 * @param logger - Logger instance
 * @returns Provider configuration
 * @throws Error if no provider is available
 */
export function resolveAIProvider(logger: Logger): AIProviderConfig {
  // Try GPT-5.5 first
  if (process.env.OPENAI_API_KEY) {
    logger.info('Using GPT-5.5 for GAQL generation')
    return {
      provider: 'openai' as const,
      model: 'gpt-5.5',
      apiKey: process.env.OPENAI_API_KEY,
    }
  }

  // Fallback to Claude 4 Opus
  if (process.env.ANTHROPIC_API_KEY) {
    logger.info('Using Claude 4.7 Opus for GAQL generation (GPT-5.5 not available)')
    return {
      provider: 'anthropic' as const,
      model: 'claude-opus-4-7',
      apiKey: process.env.ANTHROPIC_API_KEY,
    }
  }

  // Third fallback to Google Gemini
  if (process.env.GOOGLE_API_KEY) {
    logger.info('Using Google Gemini for GAQL generation (GPT-5.5 and Claude not available)')
    return {
      provider: 'google' as const,
      model: 'gemini-3.1-pro-preview',
      apiKey: process.env.GOOGLE_API_KEY,
    }
  }

  throw new Error(
    'No AI provider available. Please set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_API_KEY'
  )
}

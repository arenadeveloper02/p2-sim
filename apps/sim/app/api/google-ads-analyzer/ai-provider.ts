/**
 * AI provider resolution for Google Ads Analyzer
 */

import type { Logger } from '@sim/logger'

export interface AnalyzerAIProviderConfig {
  provider: 'openai' | 'anthropic'
  model: string
  apiKey: string
}

/**
 * Resolves AI provider for Google Ads Analyzer analysis
 *
 * Priority order:
 * 1. GPT-5.5 (OpenAI) - gpt-5.5 (if USE_GPT_5_5=true)
 * 2. Claude 4.7 Opus (Anthropic) - claude-4.7-opus (if USE_CLAUDE_4_7=true)
 * 3. GPT-4o (OpenAI) - gpt-4o (fallback)
 *
 * @param logger - Logger instance
 * @returns Provider configuration
 * @throws Error if no provider is available
 */
export function resolveAnalyzerAIProvider(logger: Logger): AnalyzerAIProviderConfig {
  // Try GPT-5.5 first (highest priority for analysis)
  if (process.env.OPENAI_API_KEY && process.env.USE_GPT_5_5 === 'true') {
    logger.info('Using GPT-5.5 for Google Ads Analyzer')
    return {
      provider: 'openai' as const,
      model: 'gpt-5.5',
      apiKey: process.env.OPENAI_API_KEY,
    }
  }

  // Try Claude 4.7 Opus
  if (process.env.ANTHROPIC_API_KEY && process.env.USE_CLAUDE_4_7 === 'true') {
    logger.info('Using Claude 4.7 Opus for Google Ads Analyzer')
    return {
      provider: 'anthropic' as const,
      model: 'claude-4.7-opus',
      apiKey: process.env.ANTHROPIC_API_KEY,
    }
  }

  // Fallback to GPT-4o
  if (process.env.OPENAI_API_KEY) {
    logger.info('Using GPT-4o for Google Ads Analyzer (GPT-5.5 and Claude not enabled)')
    return {
      provider: 'openai' as const,
      model: 'gpt-4o',
      apiKey: process.env.OPENAI_API_KEY,
    }
  }

  throw new Error('No AI provider available for Analyzer. Please set OPENAI_API_KEY or ANTHROPIC_API_KEY')
}

/**
 * AI provider resolution for Bing Ads
 */

import type { AIProviderConfig } from './types'

/**
 * Resolves AI provider with Claude Sonnet 5 first, then GPT-5.6 Luna
 *
 * Priority order:
 * 1. Claude Sonnet 5 (Anthropic) - claude-sonnet-5, effort medium
 * 2. GPT-5.6 Luna (OpenAI) - gpt-5.6-luna
 *
 * Sized for Bing JSON query generation (report type / columns / dates),
 * not flagship Opus / Terra models.
 *
 * @returns Provider configuration
 * @throws Error if no provider is available
 */
export function resolveAIProvider(): AIProviderConfig {
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      model: 'claude-sonnet-5',
      apiKey: process.env.ANTHROPIC_API_KEY,
      thinkingLevel: 'medium',
    }
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      model: 'gpt-5.6-luna',
      apiKey: process.env.OPENAI_API_KEY,
    }
  }

  throw new Error('No AI provider available. Please set ANTHROPIC_API_KEY or OPENAI_API_KEY')
}

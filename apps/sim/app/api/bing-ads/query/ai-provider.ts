/**
 * AI provider resolution for Bing Ads
 */

import type { AIProviderConfig } from './types'

/**
 * Resolves AI provider with Claude Opus 5 (high effort) first, then GPT-5.6 Terra
 *
 * Priority order:
 * 1. Claude Opus 5 High (Anthropic) - claude-opus-5
 * 2. GPT-5.6 Terra (OpenAI) - gpt-5.6-terra
 *
 * @returns Provider configuration
 * @throws Error if no provider is available
 */
export function resolveAIProvider(): AIProviderConfig {
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: 'anthropic',
      model: 'claude-opus-5',
      apiKey: process.env.ANTHROPIC_API_KEY,
      thinkingLevel: 'high',
    }
  }

  if (process.env.OPENAI_API_KEY) {
    return {
      provider: 'openai',
      model: 'gpt-5.6-terra',
      apiKey: process.env.OPENAI_API_KEY,
    }
  }

  throw new Error(
    'No AI provider available. Please set ANTHROPIC_API_KEY or OPENAI_API_KEY'
  )
}

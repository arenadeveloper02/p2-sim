/**
 * AI provider resolution for Bing Ads
 */

import type { AIProviderConfig } from './types'

/**
 * Resolves AI provider — Claude Haiku 4.5 is the only / default model.
 *
 * @returns Provider configuration
 * @throws Error if ANTHROPIC_API_KEY is not available
 */
export function resolveAIProvider(): AIProviderConfig {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('No AI provider available. Please set ANTHROPIC_API_KEY')
  }

  return {
    provider: 'anthropic',
    model: 'claude-haiku-4-5',
    apiKey: process.env.ANTHROPIC_API_KEY,
    thinkingLevel: 'medium',
  }
}

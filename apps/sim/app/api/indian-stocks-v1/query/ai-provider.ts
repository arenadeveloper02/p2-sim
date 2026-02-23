/**
 * AI Provider Configuration for Indian Stocks V1 API
 * Prioritizes Grok (XAI) and falls back to GPT-4o (OpenAI)
 */

import { createLogger } from '@sim/logger'
import type { AIProvider } from './types'

const logger = createLogger('IndianStocksAIProvider')

/**
 * Resolves AI provider based on available API keys
 */
export function resolveAIProvider(): AIProvider {
  // Check for XAI (Grok) first - preferred for financial analysis
  if (process.env.XAI_API_KEY) {
    logger.info('Using XAI (Grok) for Indian stock analysis')
    return {
      provider: 'xai',
      model: 'grok-4-1-fast-reasoning',
      apiKey: process.env.XAI_API_KEY
    }
  }

  // Fall back to OpenAI
  if (process.env.OPENAI_API_KEY) {
    logger.info('Using OpenAI GPT-4o for Indian stock analysis')
    return {
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: process.env.OPENAI_API_KEY
    }
  }

  // No AI provider available
  throw new Error('No AI provider available. Please set XAI_API_KEY or OPENAI_API_KEY environment variable.')
}

/**
 * Validates AI provider configuration
 */
export function validateAIProvider(provider: AIProvider): boolean {
  if (!provider.apiKey || provider.apiKey.trim() === '') {
    logger.error('AI provider API key is missing or empty')
    return false
  }

  if (!provider.model || provider.model.trim() === '') {
    logger.error('AI provider model is missing or empty')
    return false
  }

  if (!['openai', 'xai'].includes(provider.provider)) {
    logger.error(`Unsupported AI provider: ${provider.provider}`)
    return false
  }

  logger.info(`AI provider validated: ${provider.provider} with model ${provider.model}`)
  return true
}

/**
 * Gets AI provider configuration with fallback
 */
export function getAIProviderConfig(): AIProvider {
  try {
    const provider = resolveAIProvider()
    
    if (!validateAIProvider(provider)) {
      throw new Error('AI provider validation failed')
    }

    return provider
  } catch (error) {
    logger.error('Failed to get AI provider configuration:', error)
    throw new Error('AI provider configuration failed. Please check your API keys.')
  }
}

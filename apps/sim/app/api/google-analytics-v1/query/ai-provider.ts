import type { Logger } from '@sim/logger'
import type { AIProviderConfig } from './types'

export function resolveAIProvider(logger: Logger): AIProviderConfig {
  const xaiApiKey = process.env.XAI_API_KEY
  const openaiApiKey = process.env.OPENAI_API_KEY

  if (xaiApiKey) {
    logger.info('Using XAI (Grok-3-latest) for query generation')
    return {
      provider: 'xai',
      model: 'grok-3-latest',
      apiKey: xaiApiKey
    }
  }

  if (openaiApiKey) {
    logger.info('Using OpenAI (GPT-4o) for query generation')
    return {
      provider: 'openai',
      model: 'gpt-4o',
      apiKey: openaiApiKey
    }
  }

  throw new Error('No AI provider API key found. Please set XAI_API_KEY or OPENAI_API_KEY')
}

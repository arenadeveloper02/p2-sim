import type { Logger } from '@sim/logger'
import type { GA4QueryResponse, AIProviderConfig } from './types'
import { resolveAIProvider } from './ai-provider'
import { GA4_QUERY_GENERATION_PROMPT } from './prompt'
import { DATE_PRESETS } from './constants'

export async function generateGA4Query(
  userQuery: string,
  logger: Logger
): Promise<GA4QueryResponse> {
  try {
    logger.info('Generating GA4 query from natural language', { userQuery })

    const aiConfig = resolveAIProvider(logger)
    const prompt = GA4_QUERY_GENERATION_PROMPT.replace('{{query}}', userQuery)

    let response: string
    if (aiConfig.provider === 'xai') {
      response = await callXAI(aiConfig, prompt, logger)
    } else {
      response = await callOpenAI(aiConfig, prompt, logger)
    }

    // Parse the AI response
    const queryResponse = JSON.parse(response) as GA4QueryResponse

    // Add default date ranges if not provided
    if (!queryResponse.dateRanges || queryResponse.dateRanges.length === 0) {
      queryResponse.dateRanges = [{
        startDate: DATE_PRESETS.last_30_days,
        endDate: DATE_PRESETS.today
      }]
    }

    logger.info('GA4 query generated successfully', {
      dimensions: queryResponse.dimensions,
      metrics: queryResponse.metrics,
      dateRanges: queryResponse.dateRanges
    })

    return queryResponse

  } catch (error) {
    logger.error('Failed to generate GA4 query', { error, userQuery })
    throw new Error(`Query generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

async function callXAI(config: AIProviderConfig, prompt: string, logger: Logger): Promise<string> {
  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1
    })
  })

  if (!response.ok) {
    throw new Error(`XAI API error: ${response.status}`)
  }

  const result = await response.json()
  return result.choices[0].message.content
}

async function callOpenAI(config: AIProviderConfig, prompt: string, logger: Logger): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1
    })
  })

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`)
  }

  const result = await response.json()
  return result.choices[0].message.content
}

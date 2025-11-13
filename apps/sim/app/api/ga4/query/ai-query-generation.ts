import { createLogger } from '@/lib/logs/console/logger'
import { executeProviderRequest } from '@/providers'
import { resolveProvider } from './ai-provider'
import { buildPrompt } from './prompt-fragments'
import type { Intent, PromptContext, DateRange } from './types'

const logger = createLogger('GA4QueryGeneration')

/**
 * Generate GA4 query using AI
 */
export async function generateGA4Query(
  userQuery: string,
  intent: Intent,
  context: PromptContext,
  skipDateValidation: boolean = false
): Promise<any> {
  logger.info('Generating GA4 query', { intent, userQuery, skipDateValidation })

  const prompt = buildPrompt(intent, context)
  const fullPrompt = `${prompt}\n\n**User Query**: ${userQuery}\n\n**Instructions**: Generate a valid GA4 Data API query in JSON format. Return ONLY the JSON object, no explanations.`

  try {
    // Resolve AI provider
    const { provider, model, apiKey } = resolveProvider(logger)
    
    logger.info('Making AI request for GA4 query generation', {
      provider,
      model,
      hasApiKey: !!apiKey,
    })
    
    // Call AI provider
    const aiResponse = await executeProviderRequest(provider, {
      model,
      systemPrompt: fullPrompt,
      messages: [
        {
          role: 'user',
          content: `Generate GA4 query for: "${userQuery}"`,
        },
      ],
      apiKey,
      temperature: 0.1,
      maxTokens: 4000,
    })
    
    // Extract response text
    const responseText = typeof aiResponse === 'string' 
      ? aiResponse 
      : (aiResponse as any).content || JSON.stringify(aiResponse)
    
    logger.info('AI response received', { responseLength: responseText.length })

    // Extract JSON from AI response
    const ga4Query = extractJSON(responseText)

    if (!ga4Query) {
      throw new Error('Failed to extract valid JSON from AI response')
    }

    // Validate query structure (optionally skip date validation)
    validateGA4Query(ga4Query, skipDateValidation)

    logger.info('GA4 query generated successfully', {
      dimensions: ga4Query.dimensions?.length || 0,
      metrics: ga4Query.metrics?.length || 0,
    })

    return ga4Query
  } catch (error: any) {
    logger.error('Failed to generate GA4 query', { error: error.message })
    throw error
  }
}

/**
 * Extract JSON from AI response
 */
function extractJSON(response: string): any {
  try {
    // Try to parse the entire response as JSON
    return JSON.parse(response)
  } catch {
    // Try to extract JSON from code blocks
    const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[1])
    }

    // Try to find JSON object in the response
    const objectMatch = response.match(/\{[\s\S]*\}/)
    if (objectMatch) {
      return JSON.parse(objectMatch[0])
    }

    return null
  }
}

/**
 * Validate GA4 query structure
 */
function validateGA4Query(query: any, skipDateValidation: boolean = false): void {
  // Skip date validation if requested (dates will be added later)
  if (!skipDateValidation) {
    if (!query.dateRanges || !Array.isArray(query.dateRanges) || query.dateRanges.length === 0) {
      throw new Error('GA4 query must have at least one dateRange')
    }

    // Validate date ranges
    for (const dateRange of query.dateRanges) {
      if (!dateRange.startDate || !dateRange.endDate) {
        throw new Error('Each dateRange must have startDate and endDate')
      }

      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(dateRange.startDate) || !dateRegex.test(dateRange.endDate)) {
        throw new Error('Dates must be in YYYY-MM-DD format')
      }
    }
  }

  if (!query.metrics || !Array.isArray(query.metrics) || query.metrics.length === 0) {
    throw new Error('GA4 query must have at least one metric')
  }

  // Validate metrics
  for (const metric of query.metrics) {
    if (!metric.name) {
      throw new Error('Each metric must have a name')
    }
  }

  // Validate dimensions (if present)
  if (query.dimensions) {
    for (const dimension of query.dimensions) {
      if (!dimension.name) {
        throw new Error('Each dimension must have a name')
      }
    }
  }
}

/**
 * Build context from date ranges
 */
export function buildContext(dateRanges: DateRange[]): PromptContext {
  if (dateRanges.length === 0) {
    return {}
  }

  if (dateRanges.length === 1) {
    return {
      dateRange: dateRanges[0],
    }
  }

  // Comparison query
  return {
    comparison: {
      main: dateRanges[0],
      comparison: dateRanges[1],
    },
  }
}

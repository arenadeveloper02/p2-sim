/**
 * Shopify GraphQL query generation using AI
 */

import { createLogger } from '@sim/logger'
import { executeProviderRequest } from '@/providers'
import { resolveAIProvider } from './ai-provider'
import { SHOPIFY_SYSTEM_PROMPT } from './prompt'
import type { GraphQLResponse } from './types'

const logger = createLogger('ShopifyGraphQL')

/**
 * Generates Shopify GraphQL query using AI
 */
export async function generateGraphQLQuery(naturalQuery: string): Promise<GraphQLResponse> {
  try {
    logger.info('Generating Shopify GraphQL query for:', naturalQuery)
    
    // Resolve AI provider
    const { provider, model, apiKey } = resolveAIProvider(logger)
    
    // Generate GraphQL query using AI
    const aiResponse = await executeProviderRequest(provider, {
      model,
      systemPrompt: SHOPIFY_SYSTEM_PROMPT,
      context: `Convert this to Shopify GraphQL: "${naturalQuery}"`,
      messages: [
        {
          role: 'user',
          content: `Generate a Shopify GraphQL query for: "${naturalQuery}"`,
        },
      ],
      apiKey,
      temperature: 0.1,
      maxTokens: 2048,
    })
    
    // Extract content from AI response
    const responseContent = typeof aiResponse === 'string' 
      ? aiResponse 
      : 'content' in aiResponse 
        ? aiResponse.content 
        : JSON.stringify(aiResponse)
    
    let queryData
    try {
      queryData = JSON.parse(responseContent)
    } catch (parseError) {
      logger.error('AI returned invalid JSON:', responseContent)
      throw new Error('Failed to parse AI response')
    }
    
    // Validate response structure
    if (!queryData.query) {
      throw new Error('AI response missing required query field')
    }
    
    logger.info('Generated GraphQL query:', {
      query: queryData.query,
      type: queryData.query_type,
      entities: queryData.entities_used,
      fields: queryData.fields_used,
    })
    
    return {
      query: queryData.query,
      query_type: queryData.query_type,
      entities_used: queryData.entities_used,
      fields_used: queryData.fields_used,
    }
    
  } catch (error) {
    logger.error('GraphQL query generation failed:', error)
    throw new Error(`GraphQL generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Extracts date range from natural language query
 */
export function extractDateRange(query: string): { startDate?: string, endDate?: string } {
  const datePatterns = [
    /(\d{4}-\d{2}-\d{2})\s*to\s*(\d{4}-\d{2}-\d{2})/i,
    /from\s*(\d{4}-\d{2}-\d{2})\s*to\s*(\d{4}-\d{2}-\d{2})/i,
    /between\s*(\d{4}-\d{2}-\d{2})\s*and\s*(\d{4}-\d{2}-\d{2})/i,
  ]
  
  for (const pattern of datePatterns) {
    const match = query.match(pattern)
    if (match) {
      return {
        startDate: match[1],
        endDate: match[2],
      }
    }
  }
  
  // Handle relative dates
  const today = new Date()
  const relativePatterns = [
    { pattern: /last\s+(\d+)\s+days/i, days: -30 },
    { pattern: /this\s+month/i, days: -30 },
    { pattern: /last\s+month/i, days: -60 },
    { pattern: /this\s+year/i, days: -365 },
  ]
  
  for (const { pattern, days } of relativePatterns) {
    if (pattern.test(query)) {
      const endDate = today.toISOString().split('T')[0]
      const startDate = new Date(today.getTime() + days * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
      return { startDate, endDate }
    }
  }
  
  return {}
}

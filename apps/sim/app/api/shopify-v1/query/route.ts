/**
 * Shopify V1 API Route
 * Simplified, AI-powered Shopify query endpoint
 */

import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { generateRequestId } from '@/lib/core/utils/request'
import { generateGraphQLQuery, extractDateRange } from './query-generation'
import { processResults } from './result-processing'
import { makeShopifyRequest, normalizeShopDomain, validateShopDomain } from './shopify-api'
import type { ShopifyV1Request } from './types'

const logger = createLogger('ShopifyV1API')

/**
 * Resolves shop domain input (supports various formats)
 */
function resolveShopDomain(shopInput: string): string {
  if (!shopInput) {
    throw new Error('Shop domain is required')
  }
  
  const normalized = normalizeShopDomain(shopInput.trim())
  
  if (!validateShopDomain(normalized)) {
    throw new Error(`Invalid shop domain format: ${shopInput}`)
  }
  
  return normalized
}

/**
 * Extracts access token from request headers or environment
 */
function extractAccessToken(request: NextRequest): string {
  // Try Authorization header first
  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7)
  }
  
  // Try X-Shopify-Access-Token header
  const shopifyToken = request.headers.get('x-shopify-access-token')
  if (shopifyToken) {
    return shopifyToken
  }
  
  // Fallback to environment variable (for development)
  if (process.env.SHOPIFY_ACCESS_TOKEN) {
    return process.env.SHOPIFY_ACCESS_TOKEN
  }
  
  throw new Error('Shopify access token is required. Provide via Authorization header, X-Shopify-Access-Token header, or SHOPIFY_ACCESS_TOKEN environment variable')
}

/**
 * POST /api/shopify-v1/query
 */
export async function POST(request: NextRequest) {
  const requestId = generateRequestId()
  
  try {
    logger.info(`[${requestId}] Shopify V1 API request started`)
    
    // Parse request body
    const body: ShopifyV1Request = await request.json()
    const { query, shopDomain } = body
    
    // Validate required fields
    if (!query?.trim()) {
      return NextResponse.json({
        error: 'Query is required',
        example: 'Show me all products from last month'
      }, { status: 400 })
    }
    
    if (!shopDomain?.trim()) {
      return NextResponse.json({
        error: 'Shop domain is required',
        example: 'your-store.myshopify.com'
      }, { status: 400 })
    }
    
    // Resolve and validate shop domain
    const resolvedDomain = resolveShopDomain(shopDomain)
    logger.info(`[${requestId}] Resolved shop domain: ${resolvedDomain}`)
    
    // Extract access token
    const accessToken = extractAccessToken(request)
    logger.info(`[${requestId}] Access token provided`)
    
    // Generate GraphQL query using AI
    logger.info(`[${requestId}] Generating GraphQL for: ${query}`)
    const queryResult = await generateGraphQLQuery(query)
    
    logger.info(`[${requestId}] Generated GraphQL: ${queryResult.query}`)
    logger.info(`[${requestId}] GraphQL Query Type: ${queryResult.query_type}`)
    logger.info(`[${requestId}] GraphQL Entities Used: ${JSON.stringify(queryResult.entities_used)}`)
    logger.info(`[${requestId}] GraphQL Fields Used: ${JSON.stringify(queryResult.fields_used)}`)
    
    // Execute the GraphQL query
    logger.info(`[${requestId}] Executing Shopify GraphQL query`)
    const apiResult = await makeShopifyRequest(resolvedDomain, accessToken, queryResult.query)
    
    // Process results
    const processedResults = processResults(apiResult, requestId, logger)
    
    logger.info(`[${requestId}] API Response:`, {
      rowCount: processedResults.row_count,
      totalRows: processedResults.total_rows,
      totals: processedResults.totals,
      sampleRows: processedResults.rows.slice(0, 2) // Show first 2 rows
    })
    
    const executionTime = Date.now() - Date.now()
    
    return NextResponse.json({
      success: true,
      query: query,
      shop: {
        domain: resolvedDomain,
      },
      graphql: {
        query: queryResult.query,
        queryType: queryResult.query_type,
        entitiesUsed: queryResult.entities_used,
        fieldsUsed: queryResult.fields_used,
      },
      data: processedResults.rows,
      totals: processedResults.totals,
      metadata: {
        rowCount: processedResults.row_count,
        totalRows: processedResults.total_rows,
        execution_time_ms: executionTime
      }
    })
    
  } catch (error) {
    logger.error(`[${requestId}] Shopify V1 API request failed:`, error)
    
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Shopify query failed',
      success: false
    }, { status: 500 })
  }
}

/**
 * GET /api/shopify-v1/query - Health check
 */
export async function GET() {
  return NextResponse.json({
    status: 'healthy',
    service: 'Shopify V1 API',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  })
}

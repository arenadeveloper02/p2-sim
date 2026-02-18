/**
 * Shopify API result processing
 */

import { createLogger } from '@sim/logger'
import type { ProcessedResults } from './types'

const logger = createLogger('ShopifyResults')

/**
 * Processes Shopify GraphQL API response
 */
export function processResults(apiResponse: any, requestId: string, logger: any): ProcessedResults {
  try {
    logger.info(`[${requestId}] Processing Shopify API response`)
    
    // Handle different response structures
    let data = apiResponse
    let rows: any[] = []
    let totals: Record<string, number> = {}
    
    // Extract data based on query type
    if (apiResponse.data) {
      data = apiResponse.data
      
      // Handle different entity types
      if (data.products) {
        rows = data.products.edges?.map((edge: any) => ({
          id: edge.node.id,
          title: edge.node.title,
          vendor: edge.node.vendor,
          productType: edge.node.productType,
          status: edge.node.status,
          createdAt: edge.node.createdAt,
          ...processVariants(edge.node.variants?.edges || []),
        })) || []
        
        totals = {
          totalProducts: data.products.edges?.length || 0,
        }
      }
      
      if (data.orders) {
        rows = data.orders.edges?.map((edge: any) => ({
          id: edge.node.id,
          name: edge.node.name,
          email: edge.node.email,
          totalPrice: parseFloat(edge.node.totalPriceSet?.shopMoney?.amount || '0'),
          currencyCode: edge.node.totalPriceSet?.shopMoney?.currencyCode || 'USD',
          financialStatus: edge.node.financialStatus,
          fulfillmentStatus: edge.node.fulfillmentStatus,
          createdAt: edge.node.createdAt,
          processedAt: edge.node.processedAt,
          ...processLineItems(edge.node.lineItems?.edges || []),
        })) || []
        
        totals = {
          totalOrders: data.orders.edges?.length || 0,
          totalRevenue: rows.reduce((sum, order) => sum + order.totalPrice, 0),
          averageOrderValue: rows.length > 0 ? rows.reduce((sum, order) => sum + order.totalPrice, 0) / rows.length : 0,
        }
      }
      
      if (data.customers) {
        rows = data.customers.edges?.map((edge: any) => ({
          id: edge.node.id,
          firstName: edge.node.firstName,
          lastName: edge.node.lastName,
          email: edge.node.email,
          phone: edge.node.phone,
          ordersCount: edge.node.ordersCount,
          state: edge.node.state,
          createdAt: edge.node.createdAt,
          tags: edge.node.tags || [],
          acceptsMarketing: edge.node.acceptsMarketing,
        })) || []
        
        totals = {
          totalCustomers: data.customers.edges?.length || 0,
        }
      }
      
      if (data.collections) {
        rows = data.collections.edges?.map((edge: any) => ({
          id: edge.node.id,
          title: edge.node.title,
          description: edge.node.description,
          handle: edge.node.handle,
          createdAt: edge.node.createdAt,
          updatedAt: edge.node.updatedAt,
          productsCount: edge.node.products?.edges?.length || 0,
        })) || []
        
        totals = {
          totalCollections: data.collections.edges?.length || 0,
        }
      }
    }
    
    // Handle errors
    if (apiResponse.errors) {
      logger.warn(`[${requestId}] Shopify API errors:`, apiResponse.errors)
    }
    
    const result = {
      rows,
      row_count: rows.length,
      total_rows: rows.length,
      totals,
    }
    
    logger.info(`[${requestId}] Processed results:`, {
      rowCount: result.row_count,
      totals: result.totals,
    })
    
    return result
    
  } catch (error) {
    logger.error(`[${requestId}] Error processing Shopify results:`, error)
    return {
      rows: [],
      row_count: 0,
      total_rows: 0,
      totals: {},
    }
  }
}

/**
 * Processes product variants
 */
function processVariants(variants: any[]): Record<string, any> {
  if (!variants.length) return {}
  
  const firstVariant = variants[0]?.node
  return {
    variantId: firstVariant?.id,
    variantTitle: firstVariant?.title,
    price: parseFloat(firstVariant?.price || '0'),
    sku: firstVariant?.sku,
    inventoryQuantity: firstVariant?.inventoryQuantity || 0,
  }
}

/**
 * Processes order line items
 */
function processLineItems(lineItems: any[]): Record<string, any> {
  if (!lineItems.length) return {}
  
  const items = lineItems.map(item => ({
    lineItemId: item.node.id,
    title: item.node.title,
    quantity: item.node.quantity,
    price: parseFloat(item.node.originalUnitPriceSet?.shopMoney?.amount || '0'),
  }))
  
  return {
    lineItems: items,
    totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
  }
}

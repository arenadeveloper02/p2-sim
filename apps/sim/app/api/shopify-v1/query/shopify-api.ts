/**
 * Shopify GraphQL API client
 */

import { createLogger } from '@sim/logger'
import { SHOPIFY_API_VERSION } from './constants'

const logger = createLogger('ShopifyAPI')

/**
 * Makes request to Shopify GraphQL API
 */
export async function makeShopifyRequest(
  shopDomain: string, 
  accessToken: string, 
  query: string
): Promise<any> {
  try {
    // Ensure shop domain has .myshopify.com
    const fullDomain = shopDomain.includes('.myshopify.com') 
      ? shopDomain 
      : `${shopDomain}.myshopify.com`
    
    const url = `https://${fullDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`
    
    logger.info(`Making Shopify GraphQL request to: ${fullDomain}`)
    logger.debug(`GraphQL query:`, query)
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query }),
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      logger.error(`Shopify API error ${response.status}:`, errorText)
      throw new Error(`Shopify API error: ${response.status} - ${errorText}`)
    }
    
    const data = await response.json()
    logger.info('Shopify API response received successfully')
    
    return data
    
  } catch (error) {
    logger.error('Shopify API request failed:', error)
    throw new Error(`Shopify API request failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Validates shop domain format
 */
export function validateShopDomain(domain: string): boolean {
  const shopDomainPattern = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/
  const shortDomainPattern = /^[a-zA-Z0-9][a-zA-Z0-9\-]*$/
  
  return shopDomainPattern.test(domain) || shortDomainPattern.test(domain)
}

/**
 * Extracts shop domain from various formats
 */
export function normalizeShopDomain(domain: string): string {
  // Remove https://, http://, www., etc.
  const cleanDomain = domain
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '')
  
  // If it doesn't have .myshopify.com, add it
  if (!cleanDomain.includes('.myshopify.com')) {
    return `${cleanDomain}.myshopify.com`
  }
  
  return cleanDomain
}

/**
 * Google Search Console Constants
 * GSC site configurations and account mappings
 */

/**
 * Current date reference for GSC query generation
 * Dynamically calculated to always reflect the actual current date
 * Format: YYYY-MM-DD for proper date calculations
 */
export const CURRENT_DATE = new Date().toISOString().split('T')[0]

export const GSC_ACCOUNTS = {
  'example': {
    url: 'example.com',
    name: 'Example Site',
    siteUrl: 'https://example.com',
    property: 'sc-domain:example.com'
  },
  'blog': {
    url: 'blog.example.com',
    name: 'Blog Site',
    siteUrl: 'https://blog.example.com', 
    property: 'sc-domain:blog.example.com'
  },
  'shop': {
    url: 'shop.example.com',
    name: 'Shop Site',
    siteUrl: 'https://shop.example.com',
    property: 'sc-domain:shop.example.com'
  }
}

export function getGSCAccount(siteKey: string) {
  const account = GSC_ACCOUNTS[siteKey as keyof typeof GSC_ACCOUNTS]
  if (!account) {
    throw new Error(`Invalid GSC site key: ${siteKey}. Available sites: ${Object.keys(GSC_ACCOUNTS).join(', ')}`)
  }
  return account
}

export function getGSCSiteUrl(siteKey: string): string {
  return getGSCAccount(siteKey).property
}

export function getGSCSiteName(siteKey: string): string {
  return getGSCAccount(siteKey).name
}

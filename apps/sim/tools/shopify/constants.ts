// Shopify Output Property Constants
import type { OutputProperty } from '@/tools/types'

/**
 * Shared output property constants for Shopify tools.
 * Based on Shopify Admin GraphQL API documentation.
 * @see https://shopify.dev/docs/api/admin-graphql
 */

/** Money properties from Shopify MoneyV2 object */
export const MONEY_PROPERTIES = {
  amount: { type: 'string', description: 'Decimal money amount' },
  currencyCode: { type: 'string', description: 'Currency code (ISO 4217)' },
} as const satisfies Record<string, OutputProperty>

/** MoneyBag properties (shop and presentment currencies) */
export const MONEY_BAG_PROPERTIES = {
  shopMoney: {
    type: 'object',
    description: 'Amount in shop currency',
    properties: MONEY_PROPERTIES,
  },
  presentmentMoney: {
    type: 'object',
    description: 'Amount in presentment currency',
    properties: MONEY_PROPERTIES,
    optional: true,
  },
} as const satisfies Record<string, OutputProperty>

/** Address properties from Shopify MailingAddress object */
export const ADDRESS_PROPERTIES = {
  firstName: { type: 'string', description: 'First name', optional: true },
  lastName: { type: 'string', description: 'Last name', optional: true },
  address1: { type: 'string', description: 'Street address line 1', optional: true },
  address2: { type: 'string', description: 'Street address line 2', optional: true },
  city: { type: 'string', description: 'City', optional: true },
  province: { type: 'string', description: 'Province or state name', optional: true },
  provinceCode: { type: 'string', description: 'Province or state code', optional: true },
  country: { type: 'string', description: 'Country name', optional: true },
  countryCode: { type: 'string', description: 'Country code (ISO 3166-1 alpha-2)', optional: true },
  zip: { type: 'string', description: 'Postal or ZIP code', optional: true },
  phone: { type: 'string', description: 'Phone number', optional: true },
} as const satisfies Record<string, OutputProperty>

/** Variant properties from Shopify ProductVariant object */
export const VARIANT_PROPERTIES = {
  id: { type: 'string', description: 'Unique variant identifier (GID)' },
  title: { type: 'string', description: 'Variant title' },
  price: { type: 'string', description: 'Variant price' },
  compareAtPrice: { type: 'string', description: 'Compare at price', optional: true },
  sku: { type: 'string', description: 'Stock keeping unit', optional: true },
  inventoryQuantity: {
    type: 'number',
    description: 'Available inventory quantity',
    optional: true,
  },
} as const satisfies Record<string, OutputProperty>

/** Image properties from Shopify Image object */
export const IMAGE_PROPERTIES = {
  id: { type: 'string', description: 'Unique image identifier (GID)' },
  url: { type: 'string', description: 'Image URL' },
  altText: { type: 'string', description: 'Alternative text for accessibility', optional: true },
} as const satisfies Record<string, OutputProperty>

/** Tracking info properties from Shopify FulfillmentTrackingInfo object */
export const TRACKING_INFO_PROPERTIES = {
  company: { type: 'string', description: 'Shipping carrier name', optional: true },
  number: { type: 'string', description: 'Tracking number', optional: true },
  url: { type: 'string', description: 'Tracking URL', optional: true },
} as const satisfies Record<string, OutputProperty>

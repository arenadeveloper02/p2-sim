/**
 * Google Ads V1 Query Module
 *
 * Exports all public interfaces and utilities for Google Ads V1 API
 */

export { resolveAIProvider } from './ai-provider'
export * from './constants'
export { GAQL_SYSTEM_PROMPT } from './prompt'
export { generateGAQLQuery } from './query-generation'
export { processResults } from './result-processing'
export * from './types'

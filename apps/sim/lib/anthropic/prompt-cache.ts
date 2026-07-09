/**
 * Anthropic prompt caching helpers.
 *
 * @see https://platform.claude.com/docs/en/build-with-claude/prompt-caching
 */

/** Default 1-hour ephemeral cache control for automatic prompt caching. */
export const ANTHROPIC_EPHEMERAL_CACHE_CONTROL = { type: 'ephemeral', ttl: '1h' } as const

export type AnthropicCacheControl = {
  type: 'ephemeral'
  ttl?: '5m' | '1h'
}

/**
 * Returns top-level `cache_control` for Anthropic automatic prompt caching.
 * The API caches all content up to the last cacheable block and advances the
 * breakpoint as multi-turn conversations grow.
 */
export function getAnthropicAutomaticCacheControl(): AnthropicCacheControl {
  return ANTHROPIC_EPHEMERAL_CACHE_CONTROL
}

/**
 * Provider IDs that support Anthropic automatic top-level prompt caching.
 * Bedrock and Vertex use explicit breakpoints only.
 */
const AUTOMATIC_PROMPT_CACHE_PROVIDER_IDS = new Set(['anthropic', 'azure-anthropic'])

export function supportsAnthropicAutomaticPromptCaching(providerId: string): boolean {
  return AUTOMATIC_PROMPT_CACHE_PROVIDER_IDS.has(providerId)
}

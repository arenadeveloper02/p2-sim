/**
 * Multi-API curl/key normalization for Agent Front.
 */

export interface AgentFrontApiInput {
  name?: string
  curl?: string
  apiKey?: string
}

export interface AgentFrontApiEndpoint {
  name: string
  slug: string
  curl: string
  executeUrl: string
  apiKey?: string
  envUrlKey: string
  envApiKeyKey: string
}

export type AgentFrontCombineMode = 'parallel' | 'sequence' | 'prompt'

const MAX_APIS = 3

/**
 * Extracts the first HTTP(S) URL from a curl command.
 */
export function parseExecuteUrlFromCurl(curl: string): string | undefined {
  const match = curl.match(/https?:\/\/[^\s'"\\]+/)
  return match?.[0]
}

/**
 * Converts a display name into a stable slug for routes and env keys.
 */
export function slugifyApiName(name: string, fallbackIndex: number): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || `api-${fallbackIndex}`
}

function envKeyForSlug(slug: string, kind: 'url' | 'key'): string {
  const upper = slug.replace(/-/g, '_').toUpperCase()
  return kind === 'url' ? `SIM_EXECUTE_URL_${upper}` : `SIM_API_KEY_${upper}`
}

/**
 * Builds up to three named API endpoints from block/tool inputs.
 * Skips rows without a curl. Requires at least one valid execute URL.
 */
export function normalizeAgentFrontApis(inputs: AgentFrontApiInput[]): {
  apis: AgentFrontApiEndpoint[]
  error?: string
} {
  const apis: AgentFrontApiEndpoint[] = []
  const usedSlugs = new Set<string>()

  for (let i = 0; i < Math.min(inputs.length, MAX_APIS); i++) {
    const row = inputs[i]
    const curl = row.curl?.trim()
    if (!curl) {
      continue
    }

    const executeUrl = parseExecuteUrlFromCurl(curl)
    if (!executeUrl) {
      return {
        apis: [],
        error: `API ${i + 1}: could not parse an HTTP(S) URL from the curl`,
      }
    }

    let slug = slugifyApiName(row.name ?? '', i + 1)
    if (usedSlugs.has(slug)) {
      slug = `${slug}-${i + 1}`
    }
    usedSlugs.add(slug)

    const name = row.name?.trim() || `API ${i + 1}`
    const apiKey = row.apiKey?.trim() || undefined

    apis.push({
      name,
      slug,
      curl,
      executeUrl,
      apiKey,
      envUrlKey: envKeyForSlug(slug, 'url'),
      envApiKeyKey: envKeyForSlug(slug, 'key'),
    })
  }

  if (apis.length === 0) {
    return {
      apis: [],
      error: 'At least one API curl is required (API 1, API 2, or API 3)',
    }
  }

  return { apis }
}

/**
 * Redacts API keys from curl strings for prompts and logs.
 */
export function redactCurlForPrompt(curl: string): string {
  return curl
    .replace(/(-H|--header)\s+['"]?X-API-Key:\s*[^'"\s]+['"]?/gi, '$1 X-API-Key: ***')
    .replace(/Bearer\s+[^\s'"]+/gi, 'Bearer ***')
}

export { MAX_APIS }

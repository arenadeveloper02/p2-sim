/**
 * Infer integration provider IDs from workspace env credential keys (`credential.type`
 * `env_workspace` / `env_personal`). Used so mothership/copilot "Connected Integrations"
 * matches runtime reality when tokens live in env vars instead of OAuth rows.
 */

import { getBlock } from '@/blocks'

/**
 * HubSpot block in this app uses a shared **accounts** dropdown; values are mapped to
 * `oauthCredential` in `tools.config.params` (see `hubspot.ts`). Mothership should treat
 * HubSpot as available when these options exist, even without OAuth credential rows.
 */
export function getHubSpotSharedAccountOptionIds(): string[] {
  const block = getBlock('hubspot')
  if (!block?.subBlocks) return []
  const accountsSb = block.subBlocks.find((s) => s.id === 'accounts')
  const raw = accountsSb?.options
  if (!Array.isArray(raw) || raw.length === 0) return []
  const ids: string[] = []
  for (const o of raw) {
    if (o && typeof o === 'object' && 'id' in o) {
      const id = String((o as { id: unknown }).id).trim()
      if (id) ids.push(id)
    }
  }
  return ids
}

/**
 * Returns extra provider IDs implied by env *credential* keys (not encrypted env var blobs).
 */
export function inferProviderIdsFromEnvCredentialKeys(envKeys: string[]): string[] {
  const out = new Set<string>()
  for (const key of envKeys) {
    if (!key || typeof key !== 'string') continue
    const upper = key.toUpperCase()
    if (upper.startsWith('HUBSPOT_')) {
      out.add('hubspot')
    }
  }
  return [...out]
}

export interface OAuthIntegrationPresence {
  id: string
  providerId: string
  displayName?: string | null
  role?: string | null
}

/**
 * Merges OAuth/service-account connected credentials with providers inferred from env credentials.
 * Env-only providers get a synthetic row so WORKSPACE.md still lists them as available.
 */
export function mergeOAuthIntegrationPresence(
  fromOAuthRows: OAuthIntegrationPresence[],
  envCredentialKeys: string[],
  hubspotSharedAccountIds?: string[]
): OAuthIntegrationPresence[] {
  const result: OAuthIntegrationPresence[] = [...fromOAuthRows]
  const presentProviders = new Set(fromOAuthRows.map((r) => r.providerId))

  for (const providerId of inferProviderIdsFromEnvCredentialKeys(envCredentialKeys)) {
    if (presentProviders.has(providerId)) continue
    presentProviders.add(providerId)
    result.push({
      id: `__env__:${providerId}`,
      providerId,
      displayName: 'via environment credential',
    })
  }

  if (hubspotSharedAccountIds && hubspotSharedAccountIds.length > 0 && !presentProviders.has('hubspot')) {
    result.push({
      id: '__hubspot_accounts__',
      providerId: 'hubspot',
      displayName: 'via shared accounts subblock',
    })
  }

  return result.sort(
    (a, b) => a.providerId.localeCompare(b.providerId) || a.id.localeCompare(b.id)
  )
}

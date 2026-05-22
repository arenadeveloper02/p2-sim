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

/**
 * Merges OAuth/service-account connected providers with providers inferred from env credentials.
 */
export function mergeOAuthIntegrationPresence(
  fromOAuthRows: Array<{ providerId: string }>,
  envCredentialKeys: string[],
  hubspotSharedAccountIds?: string[]
): Array<{ providerId: string }> {
  const ids = new Set(fromOAuthRows.map((r) => r.providerId))
  for (const p of inferProviderIdsFromEnvCredentialKeys(envCredentialKeys)) {
    ids.add(p)
  }
  if (hubspotSharedAccountIds && hubspotSharedAccountIds.length > 0) {
    ids.add('hubspot')
  }
  return [...ids].sort().map((providerId) => ({ providerId }))
}

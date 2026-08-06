import type { LocalCopilotProviderId } from '@/local-copilot/lib/types'

/** Default catalog selection for new local chats. */
export const DEFAULT_LOCAL_COPILOT_CATALOG_ID = 'claude' as const

/** Top-level picker groups shown when Local is selected. */
export type LocalCopilotProviderGroup = 'claude' | 'gemini' | 'bedrock'

/**
 * Allowlisted Local Copilot models selectable in chat.
 * Clients store/send these ids; the server maps them to provider + model.
 */
export const LOCAL_COPILOT_CATALOG = [
  {
    id: 'claude',
    providerGroup: 'claude',
    label: 'Claude',
    provider: 'anthropic' as LocalCopilotProviderId,
    model: null as string | null,
  },
  {
    id: 'gemini-2.5-pro',
    providerGroup: 'gemini',
    label: 'Gemini 2.5 Pro',
    provider: 'gemini' as LocalCopilotProviderId,
    model: 'gemini-2.5-pro',
  },
  {
    id: 'gemini-3.1-pro',
    providerGroup: 'gemini',
    label: 'Gemini 3.1 Pro',
    provider: 'gemini' as LocalCopilotProviderId,
    model: 'gemini-3.1-pro-preview',
  },
  {
    id: 'bedrock-claude-opus-5',
    providerGroup: 'bedrock',
    label: 'Claude Opus 5',
    provider: 'bedrock' as LocalCopilotProviderId,
    model: 'anthropic.claude-opus-5',
  },
  {
    id: 'bedrock-claude-sonnet-5',
    providerGroup: 'bedrock',
    label: 'Claude Sonnet 5',
    provider: 'bedrock' as LocalCopilotProviderId,
    model: 'anthropic.claude-sonnet-5',
  },
  // {
  //   id: 'bedrock-claude-sonnet-4',
  //   providerGroup: 'bedrock',
  //   label: 'Claude Sonnet 4',
  //   provider: 'bedrock' as LocalCopilotProviderId,
  //   model: 'anthropic.claude-sonnet-4-5-20250929-v1:0',
  // },
  {
    id: 'bedrock-nemotron-super-3-120b',
    providerGroup: 'bedrock',
    label: 'Nemotron Super 3 120B',
    provider: 'bedrock' as LocalCopilotProviderId,
    model: 'nvidia.nemotron-super-3-120b',
  },
  {
    id: 'bedrock-mistral-large-3',
    providerGroup: 'bedrock',
    label: 'Mistral Large 3',
    provider: 'bedrock' as LocalCopilotProviderId,
    model: 'mistral.mistral-large-3-675b-instruct',
  },
  // {
  //   id: 'bedrock-llama-4-maverick',
  //   providerGroup: 'bedrock',
  //   label: 'Llama 4 Maverick',
  //   provider: 'bedrock' as LocalCopilotProviderId,
  //   model: 'meta.llama4-maverick-17b-instruct-v1:0',
  // },
  {
    id: 'bedrock-llama-3.3-70b',
    providerGroup: 'bedrock',
    label: 'Llama 3.3 70B',
    provider: 'bedrock' as LocalCopilotProviderId,
    model: 'meta.llama3-3-70b-instruct-v1:0',
  },
  // {
  //   id: 'bedrock-nova-pro',
  //   providerGroup: 'bedrock',
  //   label: 'Amazon Nova Pro',
  //   provider: 'bedrock' as LocalCopilotProviderId,
  //   model: 'amazon.nova-pro-v1:0',
  // },
  // {
  //   id: 'bedrock-kimi-k2.5',
  //   providerGroup: 'bedrock',
  //   label: 'Kimi K2.5',
  //   provider: 'bedrock' as LocalCopilotProviderId,
  //   model: 'moonshotai.kimi-k2.5',
  // },
] as const

export type LocalCopilotCatalogId = (typeof LOCAL_COPILOT_CATALOG)[number]['id']

export interface LocalCopilotCatalogEntry {
  id: LocalCopilotCatalogId
  providerGroup: LocalCopilotProviderGroup
  label: string
  provider: LocalCopilotProviderId
  /**
   * Concrete provider model id. `null` for Claude — resolved from `COPILOT_MODEL`
   * at config-build time.
   */
  model: string | null
}

const CATALOG_BY_ID = new Map<string, (typeof LOCAL_COPILOT_CATALOG)[number]>(
  LOCAL_COPILOT_CATALOG.map((entry) => [entry.id, entry])
)

/** Type guard for allowlisted catalog ids. */
export function isLocalCopilotCatalogId(value: string): value is LocalCopilotCatalogId {
  return CATALOG_BY_ID.has(value)
}

/**
 * Returns the catalog entry for a known id, or `null` when the value is not
 * an allowlisted local picker id (e.g. a legacy cloud model string).
 */
export function getLocalCopilotCatalogEntry(
  catalogId: string
): (typeof LOCAL_COPILOT_CATALOG)[number] | null {
  return CATALOG_BY_ID.get(catalogId) ?? null
}

/**
 * Resolves a catalog id to its provider + concrete model.
 * Throws when the id is not allowlisted (request validation should reject first).
 */
export function resolveLocalCopilotCatalogEntry(catalogId: string): {
  id: LocalCopilotCatalogId
  provider: LocalCopilotProviderId
  model: string | null
  label: string
  providerGroup: LocalCopilotProviderGroup
} {
  const entry = CATALOG_BY_ID.get(catalogId)
  if (!entry) {
    throw new Error(`Unknown local copilot model: ${catalogId}`)
  }
  return {
    id: entry.id,
    provider: entry.provider,
    model: entry.model,
    label: entry.label,
    providerGroup: entry.providerGroup,
  }
}

/** Provider-group chip labels for the chat toolbar. */
export const LOCAL_COPILOT_PROVIDER_GROUPS: Array<{
  id: LocalCopilotProviderGroup
  label: string
}> = [
  { id: 'claude', label: 'Claude' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'bedrock', label: 'Bedrock' },
]

/** Leaf models for a provider group (Claude has a single leaf). */
export function getLocalCopilotCatalogEntriesForGroup(
  group: LocalCopilotProviderGroup
): readonly (typeof LOCAL_COPILOT_CATALOG)[number][] {
  return LOCAL_COPILOT_CATALOG.filter((entry) => entry.providerGroup === group)
}

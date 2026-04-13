/**
 * OAuth `providerId` values shown when Sim settings → integrations load inside Arena v3 (`from=arena_v3`).
 * Order is the UI sort: Gmail, Calendar, Drive, Sheets, Slack.
 */
export const ARENA_V3_MANDATORY_INTEGRATION_PROVIDER_IDS = [
  'google-email',
  'google-calendar',
  'google-drive',
  'google-sheets',
  'slack',
] as const

export type ArenaV3MandatoryIntegrationProviderId =
  (typeof ARENA_V3_MANDATORY_INTEGRATION_PROVIDER_IDS)[number]

const ARENA_V3_MANDATORY_PROVIDER_ID_SET = new Set<string>(
  ARENA_V3_MANDATORY_INTEGRATION_PROVIDER_IDS
)

/**
 * @returns Whether `providerId` is one of the integrations allowed in the Arena v3 embed.
 */
export function isArenaV3MandatoryIntegrationProviderId(
  providerId: string | null | undefined
): boolean {
  if (!providerId) return false
  return ARENA_V3_MANDATORY_PROVIDER_ID_SET.has(providerId)
}

/**
 * Sort index for mandatory providers (lower first). Unknown ids sort last.
 */
export function getArenaV3MandatoryIntegrationSortIndex(providerId: string | undefined): number {
  if (!providerId) return 999
  const i = ARENA_V3_MANDATORY_INTEGRATION_PROVIDER_IDS.indexOf(
    providerId as ArenaV3MandatoryIntegrationProviderId
  )
  return i === -1 ? 999 : i
}

/**
 * Returns `connections` restricted to mandatory Arena providers, in {@link ARENA_V3_MANDATORY_INTEGRATION_PROVIDER_IDS} order.
 */
export function orderArenaV3MandatoryIntegrations<T extends { providerId: string }>(
  connections: T[]
): T[] {
  const byId = new Map(
    connections
      .filter((c) => isArenaV3MandatoryIntegrationProviderId(c.providerId))
      .map((item) => [item.providerId, item])
  )
  const ordered: T[] = []
  for (const id of ARENA_V3_MANDATORY_INTEGRATION_PROVIDER_IDS) {
    const item = byId.get(id)
    if (item) ordered.push(item)
  }
  return ordered
}

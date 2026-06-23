/**
 * Default shared HubSpot portals shown in admin workspace pickers.
 * Additional portals can be added via `HUBSPOT_{ALIAS}_CLIENT_ID` env pairs.
 */
export const HUBSPOT_DEFAULT_SHARED_ACCOUNT_LABELS = {
  position2: 'Position2',
  northstar_anesthesia: 'Northstar Anesthesia',
} as const

export const HUBSPOT_DEFAULT_SHARED_ACCOUNT_ALIASES = Object.keys(
  HUBSPOT_DEFAULT_SHARED_ACCOUNT_LABELS
) as (keyof typeof HUBSPOT_DEFAULT_SHARED_ACCOUNT_LABELS)[]

/**
 * Discovers HubSpot shared portal aliases from deployment env.
 * Pattern: `HUBSPOT_{ALIAS}_CLIENT_ID` + `HUBSPOT_{ALIAS}_CLIENT_SECRET`
 * (e.g. `HUBSPOT_NORTHSTAR_ANESTHESIA_CLIENT_ID` → alias `northstar_anesthesia`).
 */
const HUBSPOT_ENV_ALIAS_CLIENT_ID_PATTERN = /^HUBSPOT_(.+)_CLIENT_ID$/

export function envPrefixToHubSpotAlias(prefix: string): string {
  return prefix.trim().toLowerCase()
}

export function hubSpotAliasToEnvPrefix(alias: string): string {
  return alias.trim().toUpperCase()
}

/**
 * Returns sorted shared portal aliases that have both client id and secret configured in env.
 */
export function listHubSpotEnvConfiguredAliases(): string[] {
  const aliases = new Set<string>()

  for (const key of Object.keys(process.env)) {
    const match = key.match(HUBSPOT_ENV_ALIAS_CLIENT_ID_PATTERN)
    if (!match?.[1]) continue

    const envPrefix = match[1]
    const clientId = process.env[key]?.trim()
    const clientSecret = process.env[`HUBSPOT_${envPrefix}_CLIENT_SECRET`]?.trim()
    if (!clientId || !clientSecret) continue

    aliases.add(envPrefixToHubSpotAlias(envPrefix))
  }

  return [...aliases].sort((left, right) => left.localeCompare(right))
}

/**
 * Default shared portals plus any extra aliases configured in env.
 */
export function listHubSpotSharedAccountAliases(): string[] {
  const aliases = new Set<string>(HUBSPOT_DEFAULT_SHARED_ACCOUNT_ALIASES)
  for (const alias of listHubSpotEnvConfiguredAliases()) {
    aliases.add(alias)
  }
  return [...aliases].sort((left, right) => left.localeCompare(right))
}

/**
 * True when the value is a shared HubSpot portal alias (not a workspace credential UUID).
 */
export function isHubSpotSharedAccountAlias(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed) return false
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    return false
  }
  return /^[a-z][a-z0-9_]*$/.test(trimmed)
}

export function formatHubSpotAliasLabel(alias: string): string {
  const trimmed = alias.trim()
  if (!trimmed) return 'HubSpot account'
  const knownLabel =
    HUBSPOT_DEFAULT_SHARED_ACCOUNT_LABELS[
      trimmed as keyof typeof HUBSPOT_DEFAULT_SHARED_ACCOUNT_LABELS
    ]
  if (knownLabel) return knownLabel
  return trimmed
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

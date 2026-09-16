/**
 * Maps Arena timezone and country selections onto the IANA timezone stored on
 * user settings. A timezone always wins. Country is used only when no timezone
 * is sent, and only for countries that have a single zone.
 */

/** Arena `US/*` links and catalog ids, keyed by a trimmed lowercase value. */
const ARENA_TIMEZONE_ALIASES: Record<string, string> = {
  'asia/kolkata': 'Asia/Kolkata',
  'asia/dubai': 'Asia/Dubai',
  'europe/paris': 'Europe/Paris',
  'europe/london': 'Europe/London',
  'pacific/auckland': 'Pacific/Auckland',
  'us/eastern': 'America/New_York',
  'us/central': 'America/Chicago',
  'us/mountain': 'America/Denver',
  'us/pacific': 'America/Los_Angeles',
  'us/alaska': 'America/Anchorage',
  'us/hawaii': 'Pacific/Honolulu',
}

/**
 * Single-zone countries from the Arena catalog. United States is omitted
 * because it spans several zones and must be sent as a timezone.
 */
const ARENA_COUNTRY_TIMEZONES: Record<string, string> = {
  india: 'Asia/Kolkata',
  'united arab emirates': 'Asia/Dubai',
  'united kingdom': 'Europe/London',
}

export interface ArenaTimezoneSelection {
  timeZone?: string | null
  country?: string | null
}

function isValidIanaTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone })
    return true
  } catch {
    return false
  }
}

function normalizeKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Resolves an Arena selection to a canonical IANA timezone, or `null` when it
 * cannot be mapped. A non-empty timezone is never replaced by country.
 */
export function mapArenaTimezone({ timeZone, country }: ArenaTimezoneSelection): string | null {
  const zone = timeZone?.trim()
  if (zone) {
    const aliased = ARENA_TIMEZONE_ALIASES[normalizeKey(zone)]
    if (aliased) return aliased
    return isValidIanaTimezone(zone) ? zone : null
  }

  const countryName = country ? normalizeKey(country) : ''
  if (!countryName) return null
  return ARENA_COUNTRY_TIMEZONES[countryName] ?? null
}

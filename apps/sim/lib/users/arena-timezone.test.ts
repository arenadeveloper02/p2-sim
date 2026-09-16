/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { mapArenaTimezone } from '@/lib/users/arena-timezone'

describe('mapArenaTimezone', () => {
  it('keeps catalog timezones that are already canonical IANA ids', () => {
    expect(mapArenaTimezone({ timeZone: 'Asia/Kolkata', country: 'India' })).toBe('Asia/Kolkata')
    expect(mapArenaTimezone({ timeZone: 'Europe/Paris' })).toBe('Europe/Paris')
    expect(mapArenaTimezone({ timeZone: 'Pacific/Auckland' })).toBe('Pacific/Auckland')
  })

  it('canonicalizes Arena US links so the settings picker can select them', () => {
    expect(mapArenaTimezone({ timeZone: 'US/Eastern', country: 'United States' })).toBe(
      'America/New_York'
    )
    expect(mapArenaTimezone({ timeZone: 'us/central' })).toBe('America/Chicago')
    expect(mapArenaTimezone({ timeZone: 'US/Mountain' })).toBe('America/Denver')
    expect(mapArenaTimezone({ timeZone: 'US/Pacific' })).toBe('America/Los_Angeles')
    expect(mapArenaTimezone({ timeZone: 'US/Alaska' })).toBe('America/Anchorage')
    expect(mapArenaTimezone({ timeZone: 'US/Hawaii' })).toBe('Pacific/Honolulu')
  })

  it('uses country only when timezone is missing, and never invents a US default', () => {
    expect(mapArenaTimezone({ country: 'India ' })).toBe('Asia/Kolkata')
    expect(mapArenaTimezone({ country: 'United Arab Emirates' })).toBe('Asia/Dubai')
    expect(mapArenaTimezone({ country: 'United Kingdom' })).toBe('Europe/London')
    expect(mapArenaTimezone({ country: 'United States' })).toBeNull()
  })

  it('does not fall back to country when the timezone cannot be mapped', () => {
    expect(mapArenaTimezone({ timeZone: 'Not/AZone', country: 'India' })).toBeNull()
    expect(mapArenaTimezone({})).toBeNull()
  })
})

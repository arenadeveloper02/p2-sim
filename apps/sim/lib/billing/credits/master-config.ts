import { db } from '@sim/db'
import { masterConfig } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import { CREDITS_PER_DOLLAR } from '@/lib/billing/constants'

/**
 * The persisted key intentionally matches the existing master_config row,
 * including its `DOLLOR` spelling.
 */
export const CREDITS_PER_DOLLAR_CONFIG_KEY = 'CREDITS_PER_DOLLOR'
export const DEFAULT_CREDITS_PER_DOLLAR = CREDITS_PER_DOLLAR

const CACHE_TTL_MS = 60_000

const logger = createLogger('CreditConversionConfig')

let cachedValue: { value: number; expiresAt: number } | null = null
let pendingLoad: Promise<number> | null = null

function parseCreditsPerDollar(value: string | undefined): number | null {
  if (!value) return null
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

async function loadCreditsPerDollar(): Promise<number> {
  try {
    const rows = await db
      .select({ value: masterConfig.value })
      .from(masterConfig)
      .where(eq(masterConfig.key, CREDITS_PER_DOLLAR_CONFIG_KEY))
      .limit(1)

    const configuredValue = parseCreditsPerDollar(rows[0]?.value)
    if (configuredValue !== null) return configuredValue

    if (rows.length > 0) {
      logger.warn('Invalid credits-per-dollar value in master_config; using fallback', {
        key: CREDITS_PER_DOLLAR_CONFIG_KEY,
        value: rows[0]?.value,
        fallback: DEFAULT_CREDITS_PER_DOLLAR,
      })
    }
  } catch (error) {
    logger.warn('Failed to load credits-per-dollar value from master_config; using fallback', {
      error,
      fallback: DEFAULT_CREDITS_PER_DOLLAR,
    })
  }

  return DEFAULT_CREDITS_PER_DOLLAR
}

/**
 * Reads the credits-per-dollar setting from master_config with a short-lived
 * process cache and a safe fallback for unavailable or invalid configuration.
 */
export function getCreditsPerDollarFromMasterConfig(): Promise<number> {
  const now = Date.now()
  if (cachedValue && cachedValue.expiresAt > now) {
    return Promise.resolve(cachedValue.value)
  }

  if (!pendingLoad) {
    pendingLoad = loadCreditsPerDollar().then((value) => {
      cachedValue = { value, expiresAt: Date.now() + CACHE_TTL_MS }
      pendingLoad = null
      return value
    })
  }

  return pendingLoad
}

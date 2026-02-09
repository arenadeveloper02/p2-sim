// Database-driven Google Ads accounts - fetched dynamically from database
import { getGoogleAdsAccounts } from '@/lib/channel-accounts'

export const GOOGLE_ADS_ACCOUNTS = await getGoogleAdsAccounts()

// Position2 Manager MCC for login
export const POSITION2_MANAGER = '4455285084'

// Constants
export const MAX_DAYS_FOR_LAST_N_DAYS = 365
export const MAX_MONTHS_FOR_LAST_N_MONTHS = 24
export const MICROS_PER_DOLLAR = 1_000_000
export const DEFAULT_DATE_RANGE_DAYS = 7

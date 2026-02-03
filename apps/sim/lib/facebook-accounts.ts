import { getFacebookAccounts } from './channel-accounts'

// Database-driven Facebook accounts - fetched dynamically
export const FACEBOOK_ACCOUNTS = await getFacebookAccounts()

export type FacebookAccountKey = keyof typeof FACEBOOK_ACCOUNTS

export function getFacebookAccountId(account: FacebookAccountKey): string {
  return FACEBOOK_ACCOUNTS[account]?.id || ''
}

export function getFacebookAccountName(account: FacebookAccountKey): string {
  return FACEBOOK_ACCOUNTS[account]?.name || ''
}

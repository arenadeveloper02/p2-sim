import { env, getEnv } from '@/lib/core/config/env'

/** Arena `user_arena_details.user_type` value for external / client stakeholders. */
export const CLIENT_STAKEHOLDER_USER_TYPE = 'client_stakeholder' as const

export interface IsClientUserOptions {
  /**
   * Arena user type from `user_arena_details.user_type` (e.g. profile API / Mixpanel).
   * When set, this takes precedence over email-domain inference.
   */
  userType?: string | null
  /**
   * When true, only `userType` is considered; missing/unknown type returns false.
   * Matches approval flows that treat null `user_type` as non-client.
   */
  userTypeOnly?: boolean
}

export interface ClientUserContext {
  isClientUser: boolean
  userType: string | null
  emailDomain: string | null
}

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase().replace(/^@/, '')
}

/**
 * Comma-separated internal employee domains (e.g. `thearena.ai`).
 * Used only when `userType` is absent and `userTypeOnly` is false.
 */
function getInternalUserDomains(): string[] {
  const raw =
    typeof window !== 'undefined'
      ? getEnv('NEXT_PUBLIC_INTERNAL_USER_DOMAINS') || env.INTERNAL_USER_DOMAINS
      : env.INTERNAL_USER_DOMAINS
  if (!raw) return []
  return raw.split(',').map(normalizeDomain).filter(Boolean)
}

/**
 * Extracts the domain portion of an email address (lowercased), or null when invalid.
 */
export function getEmailDomainFromAddress(email: string | null | undefined): string | null {
  if (!email || typeof email !== 'string') return null
  const normalized = email.trim().toLowerCase()
  const atIndex = normalized.lastIndexOf('@')
  if (atIndex < 1 || atIndex === normalized.length - 1) return null
  return normalized.slice(atIndex + 1)
}

/**
 * Returns whether the user is a client (external) user.
 *
 * Priority:
 * 1. `userType === 'client_stakeholder'` → true
 * 2. Any other non-empty `userType` → false
 * 3. Email domain not listed in `INTERNAL_USER_DOMAINS` → true (when env is set)
 * 4. Otherwise → false
 */
export function isClientUser(
  email: string | null | undefined,
  options: IsClientUserOptions = {}
): boolean {
  const { userType, userTypeOnly = false } = options

  if (userType === CLIENT_STAKEHOLDER_USER_TYPE) return true
  if (userType != null && userType !== '') return false
  if (userTypeOnly) return false

  const internalDomains = getInternalUserDomains()
  if (internalDomains.length === 0) return false

  const emailDomain = getEmailDomainFromAddress(email)
  if (!emailDomain) return false

  return !internalDomains.includes(emailDomain)
}

/**
 * Payload helper for APIs and workflow execute bodies that need a client-user flag.
 */
export function getClientUserContext(
  email: string | null | undefined,
  options: IsClientUserOptions = {}
): ClientUserContext {
  const userType =
    options.userType === CLIENT_STAKEHOLDER_USER_TYPE
      ? CLIENT_STAKEHOLDER_USER_TYPE
      : options.userType != null && options.userType !== ''
        ? options.userType
        : null

  return {
    isClientUser: isClientUser(email, options),
    userType,
    emailDomain: getEmailDomainFromAddress(email),
  }
}

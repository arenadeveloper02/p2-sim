import { db } from '@sim/db'
import { user, workspace } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import { getEmailDomainFromAddress } from '@/lib/users/is-client-user'
import { getOrganizationOwnerId } from '@/lib/workspaces/policy'

const CONSUMER_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
])

export type ChatDeployAuthType = 'public' | 'password' | 'email' | 'sso'

export interface ResolveChatDeployAccessParams {
  userId: string
  workspaceId?: string | null
  authType?: ChatDeployAuthType
  allowedEmails?: string[]
  existingAuthType?: string | null
  existingAllowedEmails?: string[] | null
  /** When true, include the org owner's email domain in allowedEmails. */
  shareWithOrg?: boolean
}

export interface ResolvedChatDeployAccess {
  authType: ChatDeployAuthType
  allowedEmails: string[]
}

function dedupeAllowedEmails(emails: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const entry of emails) {
    const normalized = entry.trim().toLowerCase()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    result.push(normalized)
  }
  return result
}

function isDomainShareEntry(entry: string): boolean {
  return entry.trim().startsWith('@')
}

function isConsumerDomain(domain: string): boolean {
  return CONSUMER_EMAIL_DOMAINS.has(domain.toLowerCase())
}

async function getUserEmail(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  const email = row?.email?.trim().toLowerCase()
  return email || null
}

/**
 * Resolves `@domain` for org-wide chat access from the organization owner's email domain.
 */
export async function getOrgInternalDomainEntry(
  workspaceId: string | null | undefined
): Promise<string | null> {
  if (!workspaceId) return null

  const [workspaceRow] = await db
    .select({ organizationId: workspace.organizationId })
    .from(workspace)
    .where(eq(workspace.id, workspaceId))
    .limit(1)

  if (!workspaceRow?.organizationId) return null

  const ownerId = await getOrganizationOwnerId(workspaceRow.organizationId)
  if (!ownerId) return null

  const [ownerRow] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, ownerId))
    .limit(1)

  const domain = getEmailDomainFromAddress(ownerRow?.email)
  if (!domain || isConsumerDomain(domain)) return null

  return `@${domain}`
}

/**
 * Applies copilot/mothership chat deploy access defaults: email auth, creator email,
 * and optional org-wide domain access from the organization owner.
 */
export async function resolveChatDeployAccess(
  params: ResolveChatDeployAccessParams
): Promise<ResolvedChatDeployAccess> {
  const hasExplicitAllowedEmails =
    Array.isArray(params.allowedEmails) && params.allowedEmails.length > 0

  let authType = (params.authType ??
    params.existingAuthType ??
    'email') as ChatDeployAuthType

  if (authType === 'public') {
    authType = 'email'
  }

  let allowedEmails: string[] = []
  if (hasExplicitAllowedEmails) {
    allowedEmails = [...params.allowedEmails!]
  } else if (Array.isArray(params.existingAllowedEmails) && params.existingAllowedEmails.length > 0) {
    allowedEmails = [...params.existingAllowedEmails]
  }

  if (authType !== 'email' && authType !== 'sso') {
    return { authType, allowedEmails: dedupeAllowedEmails(allowedEmails) }
  }

  const creatorEmail = await getUserEmail(params.userId)
  const orgDomainEntry = await getOrgInternalDomainEntry(params.workspaceId)
  const shareWithOrg =
    params.shareWithOrg === true || allowedEmails.some((entry) => isDomainShareEntry(entry))

  if (!hasExplicitAllowedEmails && allowedEmails.length === 0) {
    if (creatorEmail) allowedEmails.push(creatorEmail)
    if (shareWithOrg && orgDomainEntry) allowedEmails.push(orgDomainEntry)
  } else {
    if (creatorEmail) {
      allowedEmails = dedupeAllowedEmails([creatorEmail, ...allowedEmails])
    }
    if (shareWithOrg && orgDomainEntry) {
      allowedEmails = dedupeAllowedEmails([...allowedEmails, orgDomainEntry])
    }
  }

  return {
    authType,
    allowedEmails: dedupeAllowedEmails(allowedEmails),
  }
}

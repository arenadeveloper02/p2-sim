import { db } from '@sim/db'
import { account, credential } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import { and, eq } from 'drizzle-orm'
import { env } from '@/lib/core/config/env'
import { handleCreateCredentialFromDraft } from '@/lib/credentials/draft-hooks'
import { processCredentialDraft } from '@/lib/credentials/draft-processor'
import { safeAccountInsert } from '@/app/api/auth/oauth/utils'
import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileHostedAuth')

export const UNIPILE_LINKEDIN_PROVIDER_ID = 'unipile_linkedin' as const

const HOSTED_LINK_PATH = '/api/v1/hosted/accounts/link'

export interface CreateUnipileHostedAuthLinkParams {
  userId: string
  callbackURL: string
  correlationName: string
  workspaceId?: string | null
  /**
   * External Unipile account id (`account.account_id`). When set, creates a reconnect hosted link
   * (`type: reconnect`, `reconnect_account`) instead of a new connection.
   */
  reconnectExternalAccountId?: string | null
}

export interface CreateUnipileHostedAuthLinkResult {
  url: string
}

/**
 * Builds an ISO-8601 expiry ~30 minutes ahead for Unipile hosted auth links.
 */
export function buildHostedAuthExpiresOn(): string {
  const expires = new Date(Date.now() + 30 * 60 * 1000)
  return expires.toISOString()
}

/**
 * Reads hosted-auth notify `status` (`CREATION_SUCCESS` or `RECONNECTED`).
 */
export function extractUnipileHostedAuthStatusFromNotifyPayload(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const status = (body as Record<string, unknown>).status
  return typeof status === 'string' && status.trim() !== '' ? status.trim() : null
}

/**
 * Creates a Unipile hosted authentication URL for LinkedIn connect or reconnect.
 */
export async function createUnipileHostedAuthLink(
  params: CreateUnipileHostedAuthLinkParams
): Promise<CreateUnipileHostedAuthLinkResult> {
  const reconnectAccountId = params.reconnectExternalAccountId?.trim() || null
  const apiKey = env.UNIPILE_API_KEY?.trim()
  if (!apiKey) {
    throw new Error('UNIPILE_API_KEY is not configured')
  }
  const baseUrl = UNIPILE_BASE_URL.replace(/\/$/, '')
  const appBase = env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  const notifyUrl = `${appBase}/api/auth/unipile/hosted/notify`

  const successUrl = new URL(params.callbackURL)
  successUrl.searchParams.set('unipile_hosted', 'success')
  const failureUrl = new URL(params.callbackURL)
  failureUrl.searchParams.set('unipile_hosted', 'failure')

  const body: Record<string, unknown> = {
    type: reconnectAccountId ? 'reconnect' : 'create',
    providers: ['LINKEDIN'],
    api_url: baseUrl,
    expiresOn: buildHostedAuthExpiresOn(),
    name: params.correlationName,
    success_redirect_url: successUrl.toString(),
    failure_redirect_url: failureUrl.toString(),
    bypass_success_screen: true,
    notify_url: notifyUrl,
  }

  if (reconnectAccountId) {
    body.reconnect_account = reconnectAccountId
  }

  const response = await fetch(`${baseUrl}${HOSTED_LINK_PATH}`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify(body),
  })

  const text = await response.text()
  if (!response.ok) {
    logger.warn('Unipile hosted auth link failed', {
      status: response.status,
      snippet: text.slice(0, 500),
    })
    throw new Error('Failed to create Unipile connection link')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new Error('Invalid response from Unipile')
  }

  const url =
    typeof parsed === 'object' &&
    parsed !== null &&
    'url' in parsed &&
    typeof (parsed as { url: unknown }).url === 'string'
      ? (parsed as { url: string }).url
      : null

  if (!url) {
    throw new Error('Unipile did not return a hosted auth URL')
  }

  return { url }
}

export interface PersistUnipileLinkedInAccountParams {
  userId: string
  unipileAccountId: string
  displayLabel?: string
}

/**
 * Stores a connected Unipile LinkedIn account in Better Auth `account` and links pending credential drafts.
 */
export async function persistUnipileLinkedInAccount(
  params: PersistUnipileLinkedInAccountParams
): Promise<{ accountRowId: string }> {
  const { userId, unipileAccountId } = params
  const externalId = unipileAccountId.trim()
  if (!externalId) {
    throw new Error('Missing Unipile account id')
  }

  const existing = await db.query.account.findFirst({
    where: and(
      eq(account.userId, userId),
      eq(account.providerId, UNIPILE_LINKEDIN_PROVIDER_ID),
      eq(account.accountId, externalId)
    ),
  })

  const now = new Date()
  const scope = 'linkedin'

  if (existing) {
    await db
      .update(account)
      .set({
        accessToken: params.displayLabel ?? existing.accessToken ?? 'linked',
        scope,
        updatedAt: now,
      })
      .where(eq(account.id, existing.id))

    try {
      await processCredentialDraft({
        userId,
        providerId: UNIPILE_LINKEDIN_PROVIDER_ID,
        accountId: existing.id,
      })
    } catch (error) {
      logger.error('Failed to process credential draft for existing Unipile account', { error })
    }

    return { accountRowId: existing.id }
  }

  const rowId = `unipile_${userId}_${generateId()}`

  await safeAccountInsert(
    {
      id: rowId,
      userId,
      providerId: UNIPILE_LINKEDIN_PROVIDER_ID,
      accountId: externalId,
      accessToken: params.displayLabel ?? 'linked',
      scope,
      createdAt: now,
      updatedAt: now,
    },
    { provider: 'Unipile LinkedIn', identifier: externalId }
  )

  const persisted = await findUnipileLinkedInAccountRow(userId, externalId)
  if (!persisted) {
    throw new Error('Failed to persist Unipile LinkedIn account')
  }

  try {
    await processCredentialDraft({
      userId,
      providerId: UNIPILE_LINKEDIN_PROVIDER_ID,
      accountId: persisted.id,
    })
  } catch (error) {
    logger.error('Failed to process credential draft for Unipile account', { error })
  }

  return { accountRowId: persisted.id }
}

/**
 * Loads the Better Auth account row for a user’s Unipile LinkedIn connection.
 * `account.account_id` holds the external Unipile id; `account.id` is the internal FK target for `credential.account_id`.
 */
async function findUnipileLinkedInAccountRow(userId: string, externalUnipileAccountId: string) {
  return (
    (await db.query.account.findFirst({
      where: and(
        eq(account.userId, userId),
        eq(account.providerId, UNIPILE_LINKEDIN_PROVIDER_ID),
        eq(account.accountId, externalUnipileAccountId)
      ),
    })) ?? null
  )
}

/**
 * Extracts Unipile account id from hosted-auth notify webhook payloads.
 */
export function extractUnipileAccountIdFromNotifyPayload(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>

  const candidates = [
    record.account_id,
    record.accountId,
    typeof record.account === 'object' && record.account !== null
      ? (record.account as Record<string, unknown>).id
      : null,
    typeof record.data === 'object' && record.data !== null
      ? (record.data as Record<string, unknown>).account_id
      : null,
  ]

  for (const value of candidates) {
    if (typeof value === 'string' && value.trim() !== '') {
      return value.trim()
    }
  }

  return null
}

/**
 * Correlation `name` from hosted link maps to Sim user id (or legacy email key).
 */
export function extractCorrelationUserIdFromNotifyPayload(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const record = body as Record<string, unknown>
  const name = record.name
  if (typeof name === 'string' && name.trim() !== '') {
    return name.trim()
  }
  return null
}

export interface EnsureUnipileLinkedInWorkspaceCredentialParams {
  userId: string
  workspaceId: string
  displayName: string
  description?: string | null
  /** Better Auth `account.id` row linked to the external Unipile account id. */
  accountRowId: string
}

/**
 * Ensures a workspace OAuth credential exists for a Unipile LinkedIn account (display name + external id via `account` row).
 */
export async function ensureUnipileLinkedInWorkspaceCredential(
  params: EnsureUnipileLinkedInWorkspaceCredentialParams
): Promise<string | null> {
  const [existing] = await db
    .select({ id: credential.id })
    .from(credential)
    .where(
      and(
        eq(credential.workspaceId, params.workspaceId),
        eq(credential.type, 'oauth'),
        eq(credential.providerId, UNIPILE_LINKEDIN_PROVIDER_ID),
        eq(credential.accountId, params.accountRowId)
      )
    )
    .limit(1)

  if (existing) {
    return existing.id
  }

  const now = new Date()
  await handleCreateCredentialFromDraft({
    draft: {
      workspaceId: params.workspaceId,
      displayName: params.displayName,
      description: params.description ?? null,
    },
    accountId: params.accountRowId,
    providerId: UNIPILE_LINKEDIN_PROVIDER_ID,
    userId: params.userId,
    now,
  })

  const [created] = await db
    .select({ id: credential.id })
    .from(credential)
    .where(
      and(
        eq(credential.workspaceId, params.workspaceId),
        eq(credential.providerId, UNIPILE_LINKEDIN_PROVIDER_ID),
        eq(credential.accountId, params.accountRowId)
      )
    )
    .limit(1)

  return created?.id ?? null
}

export interface FinalizeUnipileLinkedInHostedAuthParams {
  userId: string
  /** External Unipile `account_id` used in API calls. */
  unipileAccountId: string
  workspaceId?: string
  displayName?: string
  description?: string | null
}

export interface FinalizeUnipileLinkedInHostedAuthResult {
  accountRowId: string
  credentialId?: string
}

/**
 * Persists the Unipile account and creates the integrations credential (draft and/or display name from redirect).
 */
export async function finalizeUnipileLinkedInHostedAuth(
  params: FinalizeUnipileLinkedInHostedAuthParams
): Promise<FinalizeUnipileLinkedInHostedAuthResult> {
  const { accountRowId } = await persistUnipileLinkedInAccount({
    userId: params.userId,
    unipileAccountId: params.unipileAccountId,
    displayLabel: params.displayName,
  })

  try {
    await processCredentialDraft({
      userId: params.userId,
      providerId: UNIPILE_LINKEDIN_PROVIDER_ID,
      accountId: accountRowId,
    })
  } catch (error) {
    logger.error('Failed to process Unipile credential draft', { error })
  }

  const workspaceId = params.workspaceId?.trim()
  const displayName = params.displayName?.trim()
  let credentialId: string | undefined

  if (workspaceId && displayName) {
    const id = await ensureUnipileLinkedInWorkspaceCredential({
      userId: params.userId,
      workspaceId,
      displayName,
      description: params.description ?? null,
      accountRowId,
    })
    credentialId = id ?? undefined
  }

  return { accountRowId, credentialId }
}

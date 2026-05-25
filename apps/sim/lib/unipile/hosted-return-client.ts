import { createLogger } from '@sim/logger'
import {
  consumeOAuthReturnContext,
  type OAuthReturnContext,
  readOAuthReturnContext,
} from '@/lib/credentials/client-state'

const logger = createLogger('UnipileHostedReturnClient')

export const UNIPILE_HOSTED_SUCCESS_PARAM = 'unipile_hosted'
export const UNIPILE_HOSTED_ACCOUNT_ID_PARAM = 'account_id'
export const UNIPILE_LINKEDIN_PROVIDER_ID = 'unipile_linkedin' as const

export interface UnipileHostedRedirectParams {
  hosted: 'success' | 'failure' | null
  accountId: string | null
}

/**
 * Reads Unipile hosted-auth query params and removes them from the address bar.
 */
export function readAndClearUnipileHostedRedirectParams(): UnipileHostedRedirectParams {
  if (typeof window === 'undefined') {
    return { hosted: null, accountId: null }
  }

  const url = new URL(window.location.href)
  const hostedRaw = url.searchParams.get(UNIPILE_HOSTED_SUCCESS_PARAM)
  const accountId = url.searchParams.get(UNIPILE_HOSTED_ACCOUNT_ID_PARAM)?.trim() || null

  const hosted =
    hostedRaw === 'success' || hostedRaw === 'failure' ? (hostedRaw as 'success' | 'failure') : null

  if (hosted || accountId) {
    url.searchParams.delete(UNIPILE_HOSTED_SUCCESS_PARAM)
    url.searchParams.delete(UNIPILE_HOSTED_ACCOUNT_ID_PARAM)
    window.history.replaceState({}, '', url.toString())
  }

  return { hosted, accountId }
}

/**
 * Returns whether the current URL indicates a Unipile hosted-auth redirect.
 */
export function hasUnipileHostedRedirectParams(params: UnipileHostedRedirectParams): boolean {
  return Boolean(params.hosted || params.accountId)
}

async function persistUnipileAccountFromRedirect(
  accountId: string,
  ctx: OAuthReturnContext | null
): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/unipile/hosted/complete', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId,
        workspaceId: ctx?.workspaceId,
        displayName: ctx?.displayName,
      }),
    })
    if (!response.ok) {
      logger.warn('Unipile hosted complete API failed', { status: response.status })
      return false
    }
    return true
  } catch (error) {
    logger.error('Unipile hosted complete request failed', { error })
    return false
  }
}

export interface HandleUnipileHostedRedirectResult {
  handled: boolean
  ctx: OAuthReturnContext | null
}

/**
 * Handles Unipile hosted-auth browser redirect: persists `account_id` when present, then
 * returns OAuth return context for toast/notification handling.
 */
export async function handleUnipileHostedRedirect(
  params: UnipileHostedRedirectParams
): Promise<HandleUnipileHostedRedirectResult> {
  if (!hasUnipileHostedRedirectParams(params)) {
    return { handled: false, ctx: null }
  }

  const ctx = readOAuthReturnContext()

  if (params.hosted === 'failure') {
    consumeOAuthReturnContext()
    return { handled: true, ctx: null }
  }

  const isUnipileContext = ctx?.providerId === UNIPILE_LINKEDIN_PROVIDER_ID
  const isSuccess =
    params.hosted === 'success' || (Boolean(params.accountId) && isUnipileContext)

  if (!isSuccess) {
    return { handled: true, ctx: null }
  }

  if (params.accountId) {
    await persistUnipileAccountFromRedirect(params.accountId, ctx)
  }

  return { handled: true, ctx }
}

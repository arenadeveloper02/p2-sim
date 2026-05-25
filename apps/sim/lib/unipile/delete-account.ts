import { createLogger } from '@sim/logger'
import { resolveUnipileApiKey } from '@/lib/unipile/resolve-api-key'
import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileDeleteAccount')

export interface DeleteUnipileExternalAccountParams {
  /** Unipile external account id (`account.account_id` in Sim DB). */
  externalAccountId: string
  workspaceId?: string | null
  unipileApiKey?: string | null
}

export class UnipileDeleteAccountError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'UnipileDeleteAccountError'
  }
}

/**
 * Unlinks an account from Unipile (`DELETE /api/v1/accounts/{id}`).
 * Treats 404 as already removed.
 */
export async function deleteUnipileExternalAccount(
  params: DeleteUnipileExternalAccountParams
): Promise<void> {
  const externalId = params.externalAccountId.trim()
  if (!externalId) {
    throw new UnipileDeleteAccountError('Missing Unipile account id', 400)
  }

  const apiKey = resolveUnipileApiKey({
    workspaceId: params.workspaceId,
    unipileApiKey: params.unipileApiKey,
  })
  const baseUrl = UNIPILE_BASE_URL.replace(/\/$/, '')
  const url = `${baseUrl}/api/v1/accounts/${encodeURIComponent(externalId)}`

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      accept: 'application/json',
      'X-API-KEY': apiKey,
    },
  })

  if (response.status === 200) {
    logger.info('Deleted Unipile account', { externalAccountId: externalId })
    return
  }

  if (response.status === 404) {
    logger.warn('Unipile account already deleted or not found', { externalAccountId: externalId })
    return
  }

  const snippet = await response.text().catch(() => '')
  logger.warn('Unipile delete account failed', {
    externalAccountId: externalId,
    status: response.status,
    snippet: snippet.slice(0, 500),
  })
  throw new UnipileDeleteAccountError(
    `Failed to unlink LinkedIn account from Unipile (${response.status})`,
    response.status
  )
}

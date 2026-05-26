import { createLogger } from '@sim/logger'
import { resolveUnipileApiKey } from '@/lib/unipile/resolve-api-key'
import { UNIPILE_BASE_URL } from '@/tools/unipile/types'

const logger = createLogger('UnipileReconnectAccount')

export interface ReconnectUnipileExternalAccountParams {
  /** Unipile external account id (`account.account_id` in Sim DB). */
  externalAccountId: string
  workspaceId?: string | null
  unipileApiKey?: string | null
  userId?: string | null
  /** Provider-specific reconnect payload (e.g. `{ provider: 'LINKEDIN', username, password }`). */
  body: Record<string, unknown>
}

export class UnipileReconnectAccountError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message)
    this.name = 'UnipileReconnectAccountError'
  }
}

export interface ReconnectUnipileExternalAccountResult {
  accountId: string
  object: string
}

/**
 * Reconnects a disconnected Unipile account (`POST /api/v1/accounts/{id}`).
 * Provider credentials are required in `body` per Unipile; Sim’s integrations UI uses hosted
 * reconnect (`createUnipileHostedAuthLink` with `reconnectExternalAccountId`) instead.
 */
export async function reconnectUnipileExternalAccount(
  params: ReconnectUnipileExternalAccountParams
): Promise<ReconnectUnipileExternalAccountResult> {
  const externalId = params.externalAccountId.trim()
  if (!externalId) {
    throw new UnipileReconnectAccountError('Missing Unipile account id', 400)
  }

  let apiKey: string
  try {
    apiKey = await resolveUnipileApiKey({
      workspaceId: params.workspaceId,
      unipileApiKey: params.unipileApiKey,
      userId: params.userId,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unipile API key is not configured'
    throw new UnipileReconnectAccountError(message, 503)
  }
  const baseUrl = UNIPILE_BASE_URL.replace(/\/$/, '')
  const url = `${baseUrl}/api/v1/accounts/${encodeURIComponent(externalId)}`

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      'X-API-KEY': apiKey,
    },
    body: JSON.stringify(params.body),
  })

  const text = await response.text()

  if (!response.ok) {
    logger.warn('Unipile reconnect account failed', {
      externalAccountId: externalId,
      status: response.status,
      snippet: text.slice(0, 500),
    })
    throw new UnipileReconnectAccountError(
      `Failed to reconnect LinkedIn account (${response.status})`,
      response.status
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new UnipileReconnectAccountError('Invalid response from Unipile', 502)
  }

  const record =
    typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : null
  const accountId =
    typeof record?.account_id === 'string'
      ? record.account_id.trim()
      : typeof record?.accountId === 'string'
        ? record.accountId.trim()
        : externalId
  const object = typeof record?.object === 'string' ? record.object : 'AccountReconnected'

  logger.info('Reconnected Unipile account', { externalAccountId: accountId })

  return { accountId, object }
}

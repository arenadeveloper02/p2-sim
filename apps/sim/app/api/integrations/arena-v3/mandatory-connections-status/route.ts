import { account, db, user } from '@sim/db'
import { createLogger } from '@sim/logger'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { authenticateApiKeyFromHeader, updateApiKeyLastUsed } from '@/lib/api-key/service'
import { getSession } from '@/lib/auth'
import { generateRequestId } from '@/lib/core/utils/request'
import { ARENA_V3_MANDATORY_INTEGRATION_PROVIDER_IDS } from '@/lib/oauth'
import { getUserEntityPermissions } from '@/lib/workspaces/permissions/utils'

const logger = createLogger('ArenaV3MandatoryConnectionsStatusAPI')

const MANDATORY_PROVIDER_IDS = [...ARENA_V3_MANDATORY_INTEGRATION_PROVIDER_IDS] as const

/**
 * Response for {@linkcode GET} `/api/integrations/arena-v3/mandatory-connections-status`.
 * Used by the Arena parent to decide whether to render the Sim integrations iframe (e.g. when any mandatory OAuth link is missing).
 */
export interface ArenaV3MandatoryConnectionsStatusResponse {
  /** Sim user email from the database (same source as OAuth connections). */
  email: string | null
  /** True when every mandatory provider has at least one linked `account` row for this user. */
  allMandatoryConnected: boolean
  /** Subset of {@link ARENA_V3_MANDATORY_INTEGRATION_PROVIDER_IDS} with no linked account (stable product order). */
  notConnectedProviderIds: readonly string[]
  /** Mandatory providers that have at least one linked account (stable product order). */
  connectedProviderIds: readonly string[]
}

function normalizeEmail(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toLowerCase()
  return trimmed ? trimmed : null
}

/**
 * Reads a Sim API key from the `x-api-key` header or query (`workspaceKey` or `apiKey`).
 * Prefer the header so keys are less likely to appear in access logs.
 */
function getApiKeyFromRequest(request: Request, url: URL): string | null {
  const header = request.headers.get('x-api-key')?.trim()
  if (header) return header
  const fromQuery =
    url.searchParams.get('workspaceKey')?.trim() || url.searchParams.get('apiKey')?.trim()
  return fromQuery || null
}

type ResolveUserResult =
  | { ok: true; userId: string; email: string | null }
  | { ok: false; status: number; body: Record<string, unknown> }

/**
 * Resolves the Sim user whose mandatory OAuth links are reported.
 * Session wins when present; otherwise workspace/personal API key + `email` query.
 */
async function resolveTargetUser(request: Request, url: URL): Promise<ResolveUserResult> {
  const emailParam = normalizeEmail(url.searchParams.get('email'))
  const apiKeyValue = getApiKeyFromRequest(request, url)

  const session = await getSession()
  if (session?.user?.id) {
    const userRecord = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1)

    const email = userRecord[0]?.email ?? null
    if (emailParam) {
      const sessionEmail = normalizeEmail(email)
      if (!sessionEmail || sessionEmail !== emailParam) {
        return {
          ok: false,
          status: 400,
          body: {
            error: 'email_mismatch',
            message: 'email query does not match the signed-in user',
          },
        }
      }
    }
    return { ok: true, userId: session.user.id, email }
  }

  if (!apiKeyValue) {
    return {
      ok: false,
      status: 401,
      body: {
        error: 'authentication_required',
        message:
          'Sign in (session cookie) or pass a Sim workspace/personal API key via x-api-key header or workspaceKey (or apiKey) query param with email',
      },
    }
  }

  if (!emailParam) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'email_required',
        message:
          'Query param email is required when authenticating with a workspace or personal API key',
      },
    }
  }

  const keyResult = await authenticateApiKeyFromHeader(apiKeyValue)
  if (!keyResult.success || !keyResult.userId) {
    return {
      ok: false,
      status: 401,
      body: { error: 'invalid_api_key', message: keyResult.error || 'Invalid API key' },
    }
  }

  const targetRows = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(sql`lower(${user.email}) = ${emailParam}`)
    .limit(2)

  if (targetRows.length === 0) {
    return {
      ok: false,
      status: 404,
      body: { error: 'user_not_found', message: 'No Sim user matches the given email' },
    }
  }

  if (targetRows.length > 1) {
    logger.warn('Multiple users matched mandatory-connections-status email lookup', {
      emailParam,
    })
  }

  const targetUserId = targetRows[0]?.id
  const targetEmail = targetRows[0]?.email ?? null
  if (!targetUserId) {
    return {
      ok: false,
      status: 404,
      body: { error: 'user_not_found', message: 'No Sim user matches the given email' },
    }
  }

  if (keyResult.keyType === 'workspace') {
    const workspaceId = keyResult.workspaceId
    if (!workspaceId) {
      return {
        ok: false,
        status: 500,
        body: { error: 'invalid_key_configuration', message: 'Workspace key missing workspace id' },
      }
    }
    const permission = await getUserEntityPermissions(targetUserId, 'workspace', workspaceId)
    if (permission === null) {
      return {
        ok: false,
        status: 403,
        body: {
          error: 'forbidden',
          message: 'User is not a member of the workspace for this API key',
        },
      }
    }
  } else {
    if (targetUserId !== keyResult.userId) {
      return {
        ok: false,
        status: 403,
        body: {
          error: 'forbidden',
          message:
            'Non-workspace API key may only query mandatory connection status for the key owner',
        },
      }
    }
  }

  if (keyResult.keyId) {
    await updateApiKeyLastUsed(keyResult.keyId)
  }

  return { ok: true, userId: targetUserId, email: targetEmail }
}

/**
 * Returns OAuth link status for the five Arena v3 mandatory integrations (Gmail, Calendar, Drive, Sheets, Slack).
 *
 * **Session:** Cookie session; optional `email` query must match the signed-in user (case-insensitive).
 *
 * **API key (external):** Send Sim workspace or personal API key via `x-api-key` header (preferred) or `workspaceKey` / `apiKey` query param, plus required `email` for the Sim user to inspect. Workspace keys may only query users who belong to that workspace; personal keys only the key owner.
 */
export async function GET(request: Request) {
  const requestId = generateRequestId()
  const url = new URL(request.url)

  try {
    const resolved = await resolveTargetUser(request, url)
    if (!resolved.ok) {
      if (resolved.status >= 500) {
        logger.error(`[${requestId}] Mandatory connections status auth configuration error`, {
          body: resolved.body,
        })
      } else if (resolved.status === 401 || resolved.status === 403) {
        logger.warn(`[${requestId}] Mandatory connections status rejected`, { body: resolved.body })
      }
      return NextResponse.json(resolved.body, { status: resolved.status })
    }

    const rows = await db
      .selectDistinct({ providerId: account.providerId })
      .from(account)
      .where(
        and(
          eq(account.userId, resolved.userId),
          inArray(account.providerId, MANDATORY_PROVIDER_IDS)
        )
      )

    const connected = new Set(rows.map((r) => r.providerId))
    const connectedProviderIds = MANDATORY_PROVIDER_IDS.filter((id) => connected.has(id))
    const notConnectedProviderIds = MANDATORY_PROVIDER_IDS.filter((id) => !connected.has(id))

    const body: ArenaV3MandatoryConnectionsStatusResponse = {
      email: resolved.email,
      allMandatoryConnected: notConnectedProviderIds.length === 0,
      notConnectedProviderIds,
      connectedProviderIds,
    }

    return NextResponse.json(body, { status: 200 })
  } catch (error) {
    logger.error(`[${requestId}] Error resolving mandatory connections status`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

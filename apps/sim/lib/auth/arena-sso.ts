import { createHash, randomBytes } from 'node:crypto'
import { db } from '@sim/db'
import { arenaSsoTicket, session as sessionTable, user } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { env } from '@/lib/core/config/env'
import { getBaseUrl } from '@/lib/core/utils/urls'

const logger = createLogger('ArenaSso')

const TICKET_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function getArenaSsoCookieName(): string {
  return env.ARENA_SSO_COOKIE_NAME?.trim() || 'arena_sso_dev'
}

export function getArenaSsoAudience(): string {
  return getBaseUrl().replace(/\/$/, '')
}

export function hashTicket(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export function mintTicketId(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * CASA 3.1.5: cookie-authenticated POSTs with SameSite=None need CSRF defense.
 * Allow only same-site or allowlisted Arena hub Origin; reject missing/cross-site.
 */
export function assertArenaSsoCsrf(
  request: Request
): { ok: true } | { ok: false; status: number; error: string } {
  const secFetchSite = request.headers.get('sec-fetch-site')?.toLowerCase()
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site' || secFetchSite === 'none') {
    // "none" = user-initiated (typed URL / bookmark) or non-browser; OK for cookie middleware exchanges
    return { ok: true }
  }

  const origin = request.headers.get('origin')
  if (!origin) {
    // Non-browser / server-to-server with JWT header is fine; cookie-only without Origin is rejected by caller
    return { ok: true }
  }

  const allowed = new Set<string>()
  try {
    allowed.add(new URL(getBaseUrl()).origin)
  } catch {
    /* ignore */
  }
  const hub = env.NEXT_PUBLIC_ARENA_FRONTEND_APP_URL?.trim() || env.ARENA_FRONTEND_APP_URL?.trim()
  if (hub) {
    try {
      allowed.add(new URL(hub).origin)
    } catch {
      /* ignore */
    }
  }
  for (const o of (env.ALLOWED_ORIGINS || '').split(',')) {
    const t = o.trim()
    if (t) {
      try {
        allowed.add(new URL(t).origin)
      } catch {
        allowed.add(t)
      }
    }
  }

  if (allowed.has(origin)) {
    return { ok: true }
  }

  logger.warn('Arena SSO CSRF rejected', { origin, secFetchSite })
  return { ok: false, status: 403, error: 'Cross-origin request rejected' }
}

export function extractArenaJwt(headers: Headers): string | null {
  const raw =
    headers.get('authorisation')?.trim() ||
    headers.get('authorization')?.trim() ||
    headers.get('Authorisation')?.trim() ||
    headers.get('Authorization')?.trim()
  if (!raw) return null
  if (raw.toLowerCase().startsWith('bearer ')) {
    return raw.slice(7).trim() || null
  }
  return raw
}

type ValidateOk = {
  ok: true
  email: string
  sysId?: string
  id?: string
  token?: string
}
type ValidateErr = { ok: false; status: number; error: string }

export async function validateArenaJwtViaAccountService(
  jwt: string,
  signal?: AbortSignal
): Promise<ValidateOk | ValidateErr> {
  const base =
    env.ACCOUNT_SERVICE_BASE_URL?.replace(/\/$/, '') ||
    env.ARENA_BACKEND_BASE_URL?.replace(/\/$/, '')
  if (!base) {
    return { ok: false, status: 500, error: 'ACCOUNT_SERVICE_BASE_URL is not configured' }
  }

  let response: Response
  try {
    response = await fetch(`${base}/loginservice/sso/validate`, {
      method: 'POST',
      headers: {
        authorisation: jwt,
        Accept: 'application/json',
      },
      signal,
    })
  } catch (error) {
    logger.error('Failed to reach account-service SSO validate', { error })
    return { ok: false, status: 502, error: 'Failed to validate Arena token' }
  }

  let payload: {
    statusCode?: number
    errorResponse?: string
    response?: { email?: string; sysId?: string; id?: string; token?: string }
  }
  try {
    payload = (await response.json()) as typeof payload
  } catch {
    return { ok: false, status: 502, error: 'Invalid response from account-service' }
  }

  const status = payload.statusCode ?? response.status
  if (status !== 200 || !payload.response?.email) {
    return {
      ok: false,
      status: status === 429 ? 429 : 401,
      error: payload.errorResponse || 'Invalid or expired Arena token',
    }
  }

  return {
    ok: true,
    email: payload.response.email.trim().toLowerCase(),
    sysId: payload.response.sysId,
    id: payload.response.id,
    token: payload.response.token,
  }
}

export async function findSimUserByEmail(email: string) {
  const [row] = await db
    .select()
    .from(user)
    .where(eq(user.email, email.trim().toLowerCase()))
    .limit(1)
  return row ?? null
}

export function buildArenaSsoSetCookie(
  rawTicket: string,
  maxAgeSeconds = 7 * 24 * 60 * 60
): string {
  const name = getArenaSsoCookieName()
  return `${name}=${rawTicket}; Path=/; Max-Age=${maxAgeSeconds}; HttpOnly; Secure; SameSite=None`
}

export function buildArenaSsoClearCookie(): string {
  const name = getArenaSsoCookieName()
  return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`
}

function buildSessionSetCookie(sessionToken: string): string {
  const secure = true
  const name = secure ? '__Secure-better-auth.session_token' : 'better-auth.session_token'
  const maxAge = 30 * 24 * 60 * 60
  return `${name}=${sessionToken}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=None`
}

export async function upsertTicketAndSession(params: {
  userId: string
  email: string
  sysId?: string | null
  existingRawTicket?: string | null
}): Promise<{ setCookies: string[]; userId: string }> {
  const aud = getArenaSsoAudience()
  const expiresAt = new Date(Date.now() + TICKET_TTL_MS)
  let rawTicket = params.existingRawTicket || mintTicketId()
  const ticketHash = hashTicket(rawTicket)

  if (params.existingRawTicket) {
    const [existing] = await db
      .select()
      .from(arenaSsoTicket)
      .where(
        and(
          eq(arenaSsoTicket.ticketHash, ticketHash),
          eq(arenaSsoTicket.aud, aud),
          isNull(arenaSsoTicket.revokedAt),
          gt(arenaSsoTicket.expiresAt, new Date())
        )
      )
      .limit(1)
    if (existing) {
      await db
        .update(arenaSsoTicket)
        .set({ expiresAt, updatedAt: new Date() })
        .where(eq(arenaSsoTicket.id, existing.id))
    } else {
      rawTicket = mintTicketId()
      await db.insert(arenaSsoTicket).values({
        id: mintTicketId().slice(0, 24),
        ticketHash: hashTicket(rawTicket),
        aud,
        userId: params.userId,
        arenaEmail: params.email,
        arenaSysId: params.sysId ?? null,
        expiresAt,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }
  } else {
    await db.insert(arenaSsoTicket).values({
      id: mintTicketId().slice(0, 24),
      ticketHash,
      aud,
      userId: params.userId,
      arenaEmail: params.email,
      arenaSysId: params.sysId ?? null,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  }

  const ctx = await auth.$context
  const session = await ctx.internalAdapter.createSession(params.userId, false)
  if (!session?.token) {
    throw new Error('Failed to create Better Auth session')
  }

  return {
    userId: params.userId,
    setCookies: [buildSessionSetCookie(session.token), buildArenaSsoSetCookie(rawTicket)],
  }
}

export async function exchangeTicketCookie(
  rawTicket: string
): Promise<{ ok: true; setCookies: string[] } | { ok: false; status: number; error: string }> {
  const aud = getArenaSsoAudience()
  const ticketHash = hashTicket(rawTicket)
  const [row] = await db
    .select()
    .from(arenaSsoTicket)
    .where(
      and(
        eq(arenaSsoTicket.ticketHash, ticketHash),
        eq(arenaSsoTicket.aud, aud),
        isNull(arenaSsoTicket.revokedAt),
        gt(arenaSsoTicket.expiresAt, new Date())
      )
    )
    .limit(1)

  if (!row) {
    return { ok: false, status: 401, error: 'Invalid or expired SSO ticket' }
  }

  const [u] = await db.select().from(user).where(eq(user.id, row.userId)).limit(1)
  if (!u) {
    return { ok: false, status: 403, error: 'User not found in Sim' }
  }
  if (u.banned) {
    return { ok: false, status: 403, error: 'User is banned' }
  }

  const result = await upsertTicketAndSession({
    userId: u.id,
    email: row.arenaEmail,
    sysId: row.arenaSysId,
    existingRawTicket: rawTicket,
  })
  return { ok: true, setCookies: result.setCookies }
}

export async function revokeAllForEmail(
  email: string
): Promise<{ tickets: number; sessions: number }> {
  const normalized = email.trim().toLowerCase()
  const [u] = await db.select().from(user).where(eq(user.email, normalized)).limit(1)
  if (!u) {
    return { tickets: 0, sessions: 0 }
  }

  const now = new Date()
  const ticketResult = await db
    .update(arenaSsoTicket)
    .set({ revokedAt: now, updatedAt: now })
    .where(and(eq(arenaSsoTicket.userId, u.id), isNull(arenaSsoTicket.revokedAt)))

  const sessionResult = await db.delete(sessionTable).where(eq(sessionTable.userId, u.id))

  const tickets = (ticketResult as { rowCount?: number }).rowCount ?? 0
  const sessions = (sessionResult as { rowCount?: number }).rowCount ?? 0
  logger.info('Revoked Arena SSO for user', { email: normalized, tickets, sessions })
  return { tickets, sessions }
}

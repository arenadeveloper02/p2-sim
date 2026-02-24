import { db } from '@sim/db'
import { user } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { getArenaTokenByWorkflowId } from '@/app/api/tools/arena/utils/db-utils'

export interface ArenaTokenResult {
  found: true
  userId: string
  email: string
  arenaToken: string
}

export interface ArenaTokenNotFound {
  found: false
  reason: string
}

export type ArenaTokenResponse = ArenaTokenResult | ArenaTokenNotFound

/**
 * Calls the get-token API to get the Arena token (session user).
 * Forwards the request's cookies so the API sees the same session.
 */
export async function fetchArenaTokenFromApi(
  req: NextRequest,
  workflowId?: string
): Promise<ArenaTokenResponse> {
  const url = new URL(req.url)
  const base = `${url.origin}/api/tools/arena/get-token`
  const tokenUrl = workflowId ? `${base}?workflowId=${encodeURIComponent(workflowId)}` : base
  const cookie = req.headers.get('cookie') ?? ''
  const res = await fetch(tokenUrl, {
    method: 'GET',
    headers: { cookie },
    cache: 'no-store',
  })
  const data = (await res.json()) as ArenaTokenResponse
  if (!res.ok) {
    return { found: false, reason: (data as ArenaTokenNotFound).reason ?? 'Request failed' }
  }
  return data
}

/**
 * Get Arena token: try get-token API first, then fallback to workflow owner via getArenaTokenByWorkflowId.
 * Always returns ArenaTokenResponse (email fetched when from workflow fallback).
 */
export async function getArenaToken(
  req: NextRequest,
  workflowId?: string
): Promise<ArenaTokenResponse> {
  let tokenObject = await fetchArenaTokenFromApi(req, workflowId)
  if (!tokenObject.found && workflowId) {
    const wf = await getArenaTokenByWorkflowId(workflowId)
    if (wf.found) {
      const email =
        (
          await db.select({ email: user.email }).from(user).where(eq(user.id, wf.userId)).limit(1)
        )[0]?.email ?? ''
      tokenObject = { found: true, userId: wf.userId, email, arenaToken: wf.arenaToken }
    } else {
      tokenObject = { found: false, reason: wf.reason }
    }
  }
  return tokenObject
}

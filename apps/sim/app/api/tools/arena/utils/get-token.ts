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
 * Calls the get-token API to resolve the Arena token for the session user.
 * Forwards cookie and Authorization so the API can resolve from session or internal token.
 */
export async function fetchArenaTokenFromApi(req: NextRequest): Promise<ArenaTokenResponse> {
  const url = new URL(req.url)
  const tokenUrl = `${url.origin}/api/tools/arena/get-token`
  const headers: Record<string, string> = {
    cookie: req.headers.get('cookie') ?? '',
  }
  const auth = req.headers.get('authorization')
  if (auth) headers['authorization'] = auth
  const res = await fetch(tokenUrl, { method: 'GET', headers, cache: 'no-store' })
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
  let tokenObject = await fetchArenaTokenFromApi(req)
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

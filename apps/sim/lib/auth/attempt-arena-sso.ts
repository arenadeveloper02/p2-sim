/**
 * CASA 1.2.1: never use a shared default password. Prefer arena-sso cookie/JWT handshake.
 */
export async function attemptArenaSso(options?: {
  arenaJwt?: string | null
}): Promise<{ ok: boolean }> {
  try {
    const headers: Record<string, string> = {
      Accept: 'application/json',
    }
    if (options?.arenaJwt) {
      headers.Authorisation = options.arenaJwt
    }
    const res = await fetch('/api/auth/arena-sso', {
      method: 'POST',
      credentials: 'include',
      headers,
    })
    return { ok: res.ok }
  } catch {
    return { ok: false }
  }
}

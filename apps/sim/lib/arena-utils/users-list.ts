import { createLogger } from '@sim/logger'

const logger = createLogger('ArenaUsersList')

export interface ArenaUserListItem {
  sysId: string
  name: string
  email?: string
}

/**
 * Fetches the list of Arena users (all users when allUsers=true).
 * Used during comment execution to map to/cc emails to user IDs.
 */
export async function fetchArenaUsersList(
  arenaToken: string,
  baseUrl: string
): Promise<ArenaUserListItem[]> {
  const url = `${baseUrl}/sol/v1/users/list?allUsers=true`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      authorisation: arenaToken || '',
    },
  })

  if (!res.ok) {
    const text = await res.text()
    logger.warn('Arena users list request failed', { status: res.status, body: text })
    return []
  }

  const data = (await res.json()) as { userList?: Array<Record<string, unknown>> }
  const rawList = data?.userList ?? []

  return rawList.map((user: Record<string, unknown>) => {
    const sysId = String(user.sysId ?? '')
    const name = String(user.name ?? '')
    const email =
      typeof user.email === 'string'
        ? user.email
        : typeof user.userName === 'string'
          ? user.userName
          : typeof user.emailAddress === 'string'
            ? user.emailAddress
            : undefined
    return { sysId, name, email }
  })
}

/**
 * Parses a comma-separated string into trimmed non-empty parts (e.g. emails).
 */
export function parseCommaSeparated(value: string): string[] {
  if (!value || typeof value !== 'string') return []
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Builds a map from normalized (lowercase) email to Arena user for lookup.
 */
export function buildEmailToUserMap(users: ArenaUserListItem[]): Map<string, ArenaUserListItem> {
  const map = new Map<string, ArenaUserListItem>()
  for (const u of users) {
    if (u.email) {
      map.set(u.email.toLowerCase(), u)
    }
  }
  return map
}

import axios from 'axios'
import { useQuery } from '@tanstack/react-query'
import { getArenaToken } from '@/lib/arena-utils/cookie-utils'
import { env } from '@/lib/core/config/env'

/**
 * React Query key factory for Arena user-service client list
 */
export const arenaClientKeys = {
  all: ['arenaClients'] as const,
  byUser: () => [...arenaClientKeys.all, 'getClientByUser'] as const,
}

export interface ArenaClientRow {
  clientId: string
  name: string
}

const STALE_TIME_MS = 5 * 60 * 1000

/**
 * Fetches the current user's client list (Arena getclientbyuser).
 * Used by Arena and Slack block selectors; do not call ad hoc from components.
 */
export async function fetchArenaClientsByUser(
  signal?: AbortSignal
): Promise<ArenaClientRow[]> {
  const arenaBackendBaseUrl = env.NEXT_PUBLIC_ARENA_BACKEND_BASE_URL
  if (!arenaBackendBaseUrl) {
    return []
  }

  const v2Token = await getArenaToken()
  const response = await axios.get(
    `${arenaBackendBaseUrl}/list/userservice/getclientbyuser`,
    {
      headers: {
        Authorisation: v2Token || '',
      },
      signal,
    }
  )

  let clientsData = response.data?.response
  if (!Array.isArray(clientsData) || !clientsData.length) {
    clientsData =
      response.data?.data || response.data?.clients || (Array.isArray(response.data) ? response.data : null)
  }
  if (!Array.isArray(clientsData)) {
    return []
  }

  return clientsData
}

/**
 * Shared cache for getclientbyuser. Multiple client selectors in the same session
 * reuse one in-flight / cached result (5 minute stale time).
 */
export function useArenaClientsByUser(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: arenaClientKeys.byUser(),
    queryFn: ({ signal }) => fetchArenaClientsByUser(signal),
    enabled: options?.enabled ?? true,
    staleTime: STALE_TIME_MS,
  })
}

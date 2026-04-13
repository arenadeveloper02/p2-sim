import { createLogger } from '@sim/logger'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { client } from '@/lib/auth/auth-client'
import { OAUTH_PROVIDERS, type OAuthServiceConfig } from '@/lib/oauth'

const logger = createLogger('OAuthConnectionsQuery')

/**
 * `postMessage` `data.type` when Sim is embedded in Arena (`?from=arena_v3`) and the user starts OAuth.
 * The parent should set `window.location.href = data.url` (top-level navigation) so the provider can redirect back to Sim.
 */
export const ARENA_V3_PARENT_OAUTH_NAVIGATE_MESSAGE_TYPE = 'sim:arena-v3-oauth-navigate' as const

/**
 * Query key the Arena parent app sets on the integrations iframe URL (with `from=arena_v3`).
 * Sim uses its value as OAuth `callbackURL` so Better Auth returns the user to the parent page after linking.
 *
 * Must stay in sync with the Arena embed (`ARENA_V3_IFRAME_CALLBACK_URL_QUERY_PARAM`).
 */
export const ARENA_V3_IFRAME_CALLBACK_URL_QUERY_PARAM = 'callbackURL' as const

const ARENA_V3_FROM_QUERY_VALUE = 'arena_v3' as const

/**
 * Payload posted to {@linkcode window.parent} for Arena v3 iframe OAuth handoff.
 */
export interface ArenaV3ParentOAuthNavigateMessage {
  type: typeof ARENA_V3_PARENT_OAUTH_NAVIGATE_MESSAGE_TYPE
  url: string
}

/**
 * When `from=arena_v3` and {@linkcode ARENA_V3_IFRAME_CALLBACK_URL_QUERY_PARAM} is present with a valid `http:` / `https:` URL,
 * returns that URL for OAuth `callbackURL`. Otherwise returns `fallbackCallbackURL` unchanged.
 *
 * The resolved origin must appear in Better Auth `trustedOrigins` (see `ARENA_V3_OAUTH_CALLBACK_ORIGINS` / dev defaults in `lib/auth/auth.ts`) or the `/api/auth/oauth2/link` request returns 403.
 */
export function resolveOAuthCallbackURLForArenaV3Embed(fallbackCallbackURL: string): string {
  if (typeof window === 'undefined') return fallbackCallbackURL
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get('from') !== ARENA_V3_FROM_QUERY_VALUE) return fallbackCallbackURL
    const raw = params.get(ARENA_V3_IFRAME_CALLBACK_URL_QUERY_PARAM)?.trim()
    if (!raw) return fallbackCallbackURL
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallbackCallbackURL
    return parsed.href
  } catch {
    return fallbackCallbackURL
  }
}

function isArenaV3OAuthParentDelegation(): boolean {
  if (typeof window === 'undefined') return false
  try {
    if (window.parent === window) return false
    return new URLSearchParams(window.location.search).get('from') === ARENA_V3_FROM_QUERY_VALUE
  } catch {
    return false
  }
}

function postArenaV3OAuthNavigateToParent(url: string): void {
  const payload: ArenaV3ParentOAuthNavigateMessage = {
    type: ARENA_V3_PARENT_OAUTH_NAVIGATE_MESSAGE_TYPE,
    url,
  }
  window.parent.postMessage(payload, '*')
}

async function fetchOAuth2LinkAuthorizeUrl(providerId: string, callbackURL: string): Promise<string> {
  const origin = typeof window !== 'undefined' ? window.location.origin : ''
  const response = await fetch(`${origin}/api/auth/oauth2/link`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ providerId, callbackURL }),
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(text || `Failed to start OAuth link (${response.status})`)
  }

  const data = (await response.json()) as { url?: string }
  if (!data.url || typeof data.url !== 'string') {
    throw new Error('OAuth link response missing authorization URL')
  }
  return data.url
}

/**
 * Query key factory for OAuth connection queries.
 * Provides hierarchical cache keys for connections and provider-specific accounts.
 */
export const oauthConnectionsKeys = {
  all: ['oauthConnections'] as const,
  connections: () => [...oauthConnectionsKeys.all, 'connections'] as const,
  accounts: (provider: string) => [...oauthConnectionsKeys.all, 'accounts', provider] as const,
}

/** OAuth service with connection status and linked accounts. */
export interface ServiceInfo extends OAuthServiceConfig {
  id: string
  isConnected: boolean
  lastConnected?: string
  accounts?: { id: string; name: string }[]
}

/** OAuth connection data returned from the API. */
interface OAuthConnectionResponse {
  provider: string
  baseProvider?: string
  accounts?: { id: string; name: string }[]
  lastConnected?: string
  scopes?: string[]
}

function defineServices(): ServiceInfo[] {
  const servicesList: ServiceInfo[] = []

  Object.entries(OAUTH_PROVIDERS).forEach(([_providerKey, provider]) => {
    Object.entries(provider.services).forEach(([serviceKey, service]) => {
      servicesList.push({
        ...service,
        id: serviceKey,
        isConnected: false,
        scopes: service.scopes || [],
      })
    })
  })

  return servicesList
}

async function fetchOAuthConnections(signal?: AbortSignal): Promise<ServiceInfo[]> {
  try {
    const serviceDefinitions = defineServices()

    const response = await fetch('/api/auth/oauth/connections', { signal })

    if (response.status === 404) {
      return serviceDefinitions
    }

    if (!response.ok) {
      throw new Error('Failed to fetch OAuth connections')
    }

    const data = await response.json()
    const connections = data.connections || []

    const updatedServices = serviceDefinitions.map((service) => {
      const connection = connections.find(
        (conn: OAuthConnectionResponse) => conn.provider === service.providerId
      )

      if (connection) {
        return {
          ...service,
          isConnected: connection.accounts?.length > 0,
          accounts: connection.accounts || [],
          lastConnected: connection.lastConnected,
        }
      }

      const connectionWithScopes = connections.find((conn: OAuthConnectionResponse) => {
        if (!conn.baseProvider || !service.providerId.startsWith(conn.baseProvider)) {
          return false
        }

        if (conn.scopes && service.scopes) {
          const connScopes = conn.scopes
          return service.scopes.every((scope) => connScopes.includes(scope))
        }

        return false
      })

      if (connectionWithScopes) {
        return {
          ...service,
          isConnected: connectionWithScopes.accounts?.length > 0,
          accounts: connectionWithScopes.accounts || [],
          lastConnected: connectionWithScopes.lastConnected,
        }
      }

      return service
    })

    return updatedServices
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      return defineServices()
    }
    logger.error('Error fetching OAuth connections:', error)
    return defineServices()
  }
}

/**
 * Fetches all OAuth service connections with their status.
 * Returns service definitions merged with connection data.
 */
export function useOAuthConnections() {
  return useQuery({
    queryKey: oauthConnectionsKeys.connections(),
    queryFn: ({ signal }) => fetchOAuthConnections(signal),
    staleTime: 30 * 1000,
    retry: false,
  })
}

interface ConnectServiceParams {
  providerId: string
  callbackURL: string
}

/**
 * Initiates OAuth connection flow for a service.
 * Redirects the user to the provider's authorization page.
 */
export function useConnectOAuthService() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ providerId, callbackURL: callerCallbackURL }: ConnectServiceParams) => {
      const callbackURL = resolveOAuthCallbackURLForArenaV3Embed(callerCallbackURL)
      const delegateToParent = isArenaV3OAuthParentDelegation()
      const origin = typeof window !== 'undefined' ? window.location.origin : ''

      if (providerId === 'trello') {
        const url = `${origin}/api/auth/trello/authorize`
        if (delegateToParent) {
          postArenaV3OAuthNavigateToParent(url)
        } else {
          window.location.href = url
        }
        return { success: true }
      }

      if (providerId === 'shopify') {
        const returnUrl = encodeURIComponent(callbackURL)
        const url = `${origin}/api/auth/shopify/authorize?returnUrl=${returnUrl}`
        if (delegateToParent) {
          postArenaV3OAuthNavigateToParent(url)
        } else {
          window.location.href = url
        }
        return { success: true }
      }

      if (delegateToParent) {
        const url = await fetchOAuth2LinkAuthorizeUrl(providerId, callbackURL)
        postArenaV3OAuthNavigateToParent(url)
        logger.info('Delegated OAuth navigation to parent (Arena v3 iframe)', { providerId })
        return { success: true }
      }

      await client.oauth2.link({
        providerId,
        callbackURL,
      })

      return { success: true }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: oauthConnectionsKeys.connections() })
    },
    onError: (error) => {
      logger.error('OAuth connection error:', error)
    },
  })
}

interface DisconnectServiceParams {
  provider: string
  providerId?: string
  serviceId: string
  accountId?: string
}

/**
 * Disconnects an OAuth service account.
 * Performs optimistic update and rolls back on failure.
 */
export function useDisconnectOAuthService() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ provider, providerId, accountId }: DisconnectServiceParams) => {
      const response = await fetch('/api/auth/oauth/disconnect', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider,
          providerId,
          accountId,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to disconnect service')
      }

      return response.json()
    },
    onMutate: async ({ serviceId, accountId }) => {
      await queryClient.cancelQueries({ queryKey: oauthConnectionsKeys.connections() })

      const previousServices = queryClient.getQueryData<ServiceInfo[]>(
        oauthConnectionsKeys.connections()
      )

      if (previousServices) {
        queryClient.setQueryData<ServiceInfo[]>(
          oauthConnectionsKeys.connections(),
          previousServices.map((svc) => {
            if (svc.id === serviceId) {
              const updatedAccounts =
                accountId && svc.accounts ? svc.accounts.filter((acc) => acc.id !== accountId) : []
              return {
                ...svc,
                accounts: updatedAccounts,
                isConnected: updatedAccounts.length > 0,
              }
            }
            return svc
          })
        )
      }

      return { previousServices }
    },
    onError: (_err, _variables, context) => {
      if (context?.previousServices) {
        queryClient.setQueryData(oauthConnectionsKeys.connections(), context.previousServices)
      }
      logger.error('Failed to disconnect service')
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: oauthConnectionsKeys.connections() })
    },
  })
}

/** Connected OAuth account for a specific provider. */
export interface ConnectedAccount {
  id: string
  accountId: string
  providerId: string
  displayName?: string
}

async function fetchConnectedAccounts(
  provider: string,
  signal?: AbortSignal
): Promise<ConnectedAccount[]> {
  const response = await fetch(`/api/auth/accounts?provider=${provider}`, { signal })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error || `Failed to load ${provider} accounts`)
  }

  const data = await response.json()
  return data.accounts || []
}

/**
 * Fetches connected accounts for a specific OAuth provider.
 * @param provider - The provider ID (e.g., 'slack', 'google')
 * @param options - Query options including enabled flag
 */
export function useConnectedAccounts(provider: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: oauthConnectionsKeys.accounts(provider),
    queryFn: ({ signal }) => fetchConnectedAccounts(provider, signal),
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

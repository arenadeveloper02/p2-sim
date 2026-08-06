import { useEffect } from 'react'
import { createLogger } from '@sim/logger'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import Cookies from 'js-cookie'
import { useRouter, useSearchParams } from 'next/navigation'
import { requestJson } from '@/lib/api/client/request'
import {
  type ConnectedAccount,
  disconnectOAuthContract,
  listConnectedAccountsContract,
  listOAuthConnectionsContract,
  type OAuthAccountSummary,
  type OAuthConnection,
} from '@/lib/api/contracts/oauth-connections'
import { client } from '@/lib/auth/auth-client'
import { readOAuthReturnContext } from '@/lib/credentials/client-state'
import { OAUTH_PROVIDERS, type OAuthServiceConfig } from '@/lib/oauth'
import { requiresCustomOAuthApp } from '@/lib/oauth/custom-app-config'
import { environmentKeys } from '@/hooks/queries/environment'
import { workspaceCredentialKeys } from '@/hooks/queries/utils/credential-keys'

const OAUTH_CREDENTIALS_KEY = ['oauthCredentials'] as const

const logger = createLogger('OAuthConnectionsQuery')

export const OAUTH_CONNECTIONS_STALE_TIME = 30 * 1000
export const OAUTH_CONNECTED_ACCOUNTS_STALE_TIME = 60 * 1000

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

/**
 * Arena iframe embed (`from=arena_v3`): one-time email-cookie sign-in for the integrations page.
 * Same pattern as deployed chat (`ArenaDeployedChat`: localStorage guard + `client.signIn.email`).
 */
export function useArenaV3IntegrationsAutoLogin(workspaceId: string): void {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (searchParams.get('from') !== ARENA_V3_FROM_QUERY_VALUE || !workspaceId) {
      return
    }

    const autoLoginKey = `integrations:arenaV3AutoLogin:${workspaceId}`
    let cancelled = false

    const run = async () => {
      try {
        const alreadyTried = typeof window !== 'undefined' && localStorage.getItem(autoLoginKey)
        const cookieEmail = Cookies.get('email')
        if (!cookieEmail || alreadyTried) {
          return
        }

        const sessionRes = await client.getSession()
        if (sessionRes?.data?.user?.id || cancelled) {
          return
        }

        localStorage.setItem(autoLoginKey, '1')
        await client.signIn.email(
          {
            email: cookieEmail,
            password: 'Position2!',
            callbackURL: typeof window !== 'undefined' ? window.location.href : undefined,
          },
          {}
        )
        if (!cancelled) {
          router.refresh()
        }
      } catch (error) {
        logger.error('Arena v3 integrations auto-login failed', { error })
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [searchParams, workspaceId, router])
}
//-------------------

async function fetchOAuth2LinkAuthorizeUrl(
  providerId: string,
  callbackURL: string
): Promise<string> {
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
  accounts: () => [...oauthConnectionsKeys.all, 'accounts'] as const,
  account: (provider: string) => [...oauthConnectionsKeys.accounts(), provider] as const,
}

/** OAuth service with connection status and linked accounts. */
export interface ServiceInfo extends OAuthServiceConfig {
  id: string
  isConnected: boolean
  lastConnected?: string
  accounts?: OAuthAccountSummary[]
}

type OAuthConnectionResponse = OAuthConnection

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

    const data = await requestJson(listOAuthConnectionsContract, { signal })
    const connections = data.connections || []

    const updatedServices = serviceDefinitions.map((service) => {
      const connection = connections.find(
        (conn: OAuthConnectionResponse) => conn.provider === service.providerId
      )

      if (connection) {
        return {
          ...service,
          isConnected: (connection.accounts?.length ?? 0) > 0,
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
          isConnected: (connectionWithScopes.accounts?.length ?? 0) > 0,
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
    staleTime: OAUTH_CONNECTIONS_STALE_TIME,
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

      if (providerId === 'instagram') {
        const returnUrl = encodeURIComponent(callbackURL)
        window.location.href = `/api/auth/instagram/authorize?returnUrl=${returnUrl}`
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

      if (requiresCustomOAuthApp(providerId)) {
        const returnCtx = readOAuthReturnContext()
        const workspaceId = returnCtx?.workspaceId
        if (!workspaceId) {
          throw new Error('Workspace context is required to connect this integration')
        }
        const url = new URL(`${origin}/api/auth/oauth2/custom/${providerId}/authorize`)
        url.searchParams.set('workspaceId', workspaceId)
        url.searchParams.set('returnUrl', callbackURL)
        if (delegateToParent) {
          postArenaV3OAuthNavigateToParent(url.toString())
        } else {
          window.location.href = url.toString()
        }
        return { success: true }
      }

      if (providerId === 'unipile_linkedin') {
        const returnCtx = readOAuthReturnContext()
        const response = await fetch(`${origin}/api/auth/unipile/hosted/link`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callbackURL,
            workspaceId: returnCtx?.workspaceId,
            credentialId:
              returnCtx?.reconnect && returnCtx.credentialId ? returnCtx.credentialId : undefined,
          }),
        })
        const data = (await response.json().catch(() => ({}))) as {
          url?: string
          error?: string
        }
        if (!response.ok || !data.url) {
          throw new Error(data.error || 'Failed to start LinkedIn (Unipile) connection')
        }
        if (delegateToParent) {
          postArenaV3OAuthNavigateToParent(data.url)
        } else {
          window.location.href = data.url
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
    onError: (error) => {
      logger.error('OAuth connection error:', error)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: oauthConnectionsKeys.connections() })
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
      return requestJson(disconnectOAuthContract, {
        body: {
          provider,
          providerId,
          accountId,
        },
      })
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
      queryClient.invalidateQueries({ queryKey: workspaceCredentialKeys.lists() })
      queryClient.invalidateQueries({ queryKey: workspaceCredentialKeys.details() })
      queryClient.invalidateQueries({ queryKey: OAUTH_CREDENTIALS_KEY })
      queryClient.invalidateQueries({ queryKey: environmentKeys.all })
    },
  })
}

/** Connected OAuth account for a specific provider. */
export type { ConnectedAccount }

async function fetchConnectedAccounts(
  provider: string,
  signal?: AbortSignal
): Promise<ConnectedAccount[]> {
  const data = await requestJson(listConnectedAccountsContract, {
    query: { provider },
    signal,
  })
  return data.accounts
}

/**
 * Fetches connected accounts for a specific OAuth provider.
 * @param provider - The provider ID (e.g., 'slack', 'google')
 * @param options - Query options including enabled flag
 */
export function useConnectedAccounts(provider: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: oauthConnectionsKeys.account(provider),
    queryFn: ({ signal }) => fetchConnectedAccounts(provider, signal),
    enabled: options?.enabled ?? true,
    staleTime: OAUTH_CONNECTED_ACCOUNTS_STALE_TIME,
    placeholderData: keepPreviousData,
  })
}

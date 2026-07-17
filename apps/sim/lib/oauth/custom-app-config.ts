/**
 * Browser-safe metadata for providers that use organization-scoped OAuth apps.
 * Keep database and encryption dependencies in `custom-apps.ts`.
 */
export interface CustomOAuthAppProviderConfig {
  appKey: string
  authorizationUrl: string
  tokenUrl: string
  userInfoUrl?: string
  authentication: 'basic' | 'post'
  supportsRefreshTokenRotation?: boolean
}

export const CUSTOM_OAUTH_APP_PROVIDERS: Record<string, CustomOAuthAppProviderConfig> = {
  zoom: {
    appKey: 'zoom',
    authorizationUrl: 'https://zoom.us/oauth/authorize',
    tokenUrl: 'https://zoom.us/oauth/token',
    userInfoUrl: 'https://api.zoom.us/v2/users/me',
    authentication: 'basic',
    supportsRefreshTokenRotation: true,
  },
  'zoom-admin': {
    appKey: 'zoom',
    authorizationUrl: 'https://zoom.us/oauth/authorize',
    tokenUrl: 'https://zoom.us/oauth/token',
    userInfoUrl: 'https://api.zoom.us/v2/users/me',
    authentication: 'basic',
    supportsRefreshTokenRotation: true,
  },
}

/** True when a provider requires an organization-scoped OAuth app. */
export function requiresCustomOAuthApp(providerId: string): boolean {
  return providerId in CUSTOM_OAUTH_APP_PROVIDERS
}

export function getCustomOAuthAppConfig(
  providerId: string
): CustomOAuthAppProviderConfig | undefined {
  return CUSTOM_OAUTH_APP_PROVIDERS[providerId]
}

/** Distinct app keys across all custom-app-capable providers. */
export function listCustomOAuthAppKeys(): string[] {
  return Array.from(
    new Set(Object.values(CUSTOM_OAUTH_APP_PROVIDERS).map((config) => config.appKey))
  )
}

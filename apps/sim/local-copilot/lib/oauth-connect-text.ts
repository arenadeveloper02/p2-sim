export interface OAuthConnectControl {
  type: 'credential_link'
  provider: string
  url: string
}

/**
 * Builds validated structured control data after oauth_get_auth_link succeeds.
 */
export function buildOAuthConnectControl(result: unknown): OAuthConnectControl | null {
  const record = result && typeof result === 'object' ? (result as Record<string, unknown>) : null
  if (!record) return null

  const url =
    (typeof record.oauth_url === 'string' && record.oauth_url.trim()) ||
    (typeof record.url === 'string' && record.url.trim()) ||
    (typeof record.authorizationUrl === 'string' && record.authorizationUrl.trim()) ||
    ''
  if (!url) return null

  try {
    if (new URL(url).protocol !== 'https:') return null
  } catch {
    return null
  }

  const provider =
    (typeof record.provider === 'string' && record.provider.trim()) ||
    (typeof record.providerName === 'string' && record.providerName.trim()) ||
    (typeof record.serviceName === 'string' && record.serviceName.trim()) ||
    'account'

  return {
    type: 'credential_link',
    provider,
    url,
  }
}

/**
 * Converts trusted OAuth control data into the legacy chat tag representation.
 */
export function formatOAuthConnectCredentialTag(control: OAuthConnectControl): string {
  const tag = `<credential>${JSON.stringify({
    type: 'link',
    provider: control.provider,
    value: control.url,
  })}</credential>`

  return `Connect ${control.provider} to finish setup:\n\n${tag}`
}

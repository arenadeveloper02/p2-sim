/**
 * Builds the user-visible Connect control after oauth_get_auth_link succeeds.
 * Uses the chat `<credential type="link">` tag so the Connect button always renders,
 * even when model narration is buffered during the tool round.
 */
export function formatOAuthConnectCredentialTag(result: unknown): string | null {
  const record =
    result && typeof result === 'object' ? (result as Record<string, unknown>) : null
  if (!record) return null

  const url =
    (typeof record.oauth_url === 'string' && record.oauth_url.trim()) ||
    (typeof record.url === 'string' && record.url.trim()) ||
    (typeof record.authorizationUrl === 'string' && record.authorizationUrl.trim()) ||
    ''
  if (!url || !/^https?:\/\//i.test(url)) return null

  const provider =
    (typeof record.provider === 'string' && record.provider.trim()) ||
    (typeof record.providerName === 'string' && record.providerName.trim()) ||
    (typeof record.serviceName === 'string' && record.serviceName.trim()) ||
    'account'

  const tag = `<credential>${JSON.stringify({
    type: 'link',
    provider,
    value: url,
  })}</credential>`

  return `Connect ${provider} to finish setup:\n\n${tag}`
}

import type { BrandConfig, OrganizationWhitelabelSettings } from '@/lib/branding/types'

export const DEFAULT_WORKSPACE_DOCS_PATH = '/arena-ai-docs'

/**
 * Resolve the documentation URL shown in workspace help menus.
 */
export function resolveBrandDocsUrl(documentationUrl?: string): string {
  return documentationUrl?.trim() || DEFAULT_WORKSPACE_DOCS_PATH
}

/**
 * Resolve the favicon URL for an organization: dedicated favicon, then logo, then wordmark.
 */
export function resolveOrgFaviconUrl(
  orgSettings: OrganizationWhitelabelSettings | null | undefined,
  instanceFaviconUrl?: string
): string | undefined {
  if (!orgSettings) {
    return instanceFaviconUrl
  }

  const resolvedLogo = orgSettings.logoUrl || orgSettings.wordmarkUrl
  return orgSettings.faviconUrl || resolvedLogo || instanceFaviconUrl
}

/**
 * Merge org-level whitelabel settings over the instance-level brand config.
 * Org settings take priority for any field they define.
 */
export function mergeOrgBrandConfig(
  orgSettings: OrganizationWhitelabelSettings | null,
  instanceConfig: BrandConfig
): BrandConfig {
  if (!orgSettings) {
    return instanceConfig
  }

  const orgLogo = orgSettings.logoUrl
  const orgWordmark = orgSettings.wordmarkUrl
  const resolvedLogo = orgLogo || orgWordmark
  const resolvedWordmark = orgWordmark || orgLogo

  return {
    ...instanceConfig,
    name: orgSettings.brandName || instanceConfig.name,
    logoUrl: resolvedLogo || instanceConfig.logoUrl,
    logoUrlBlacktext: resolvedLogo || instanceConfig.logoUrlBlacktext,
    wordmarkUrl: resolvedWordmark || instanceConfig.wordmarkUrl,
    faviconUrl: resolveOrgFaviconUrl(orgSettings, instanceConfig.faviconUrl),
    supportEmail: orgSettings.supportEmail || instanceConfig.supportEmail,
    documentationUrl: orgSettings.documentationUrl || instanceConfig.documentationUrl,
    termsUrl: orgSettings.termsUrl || instanceConfig.termsUrl,
    privacyUrl: orgSettings.privacyUrl || instanceConfig.privacyUrl,
    theme: {
      ...instanceConfig.theme,
      ...(orgSettings.primaryColor && { primaryColor: orgSettings.primaryColor }),
      ...(orgSettings.primaryHoverColor && { primaryHoverColor: orgSettings.primaryHoverColor }),
      ...(orgSettings.accentColor && { accentColor: orgSettings.accentColor }),
      ...(orgSettings.accentHoverColor && { accentHoverColor: orgSettings.accentHoverColor }),
    },
    isWhitelabeled:
      instanceConfig.isWhitelabeled ||
      Boolean(
        orgSettings.brandName ||
          orgSettings.logoUrl ||
          orgSettings.wordmarkUrl ||
          orgSettings.faviconUrl ||
          orgSettings.primaryColor
      ),
  }
}

function isDarkBackground(hex: string): boolean {
  let clean = hex.replace('#', '')
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.5
}

function getContrastTextColor(hex: string): string {
  return isDarkBackground(hex) ? '#ffffff' : '#000000'
}

/**
 * Generate CSS variable overrides from org whitelabel settings.
 * Returns an empty string when no color overrides are set.
 */
export function generateOrgThemeCSS(settings: OrganizationWhitelabelSettings): string {
  const vars: string[] = []

  if (settings.primaryColor) {
    vars.push(`--brand: ${settings.primaryColor};`)
    vars.push(`--brand-agent: ${settings.primaryColor};`)
    vars.push(`--brand-accent: ${settings.primaryColor};`)
    vars.push(`--auth-primary-btn-bg: ${settings.primaryColor};`)
    vars.push(`--auth-primary-btn-border: ${settings.primaryColor};`)
    vars.push(`--auth-primary-btn-hover-bg: ${settings.primaryColor};`)
    vars.push(`--auth-primary-btn-hover-border: ${settings.primaryColor};`)
    const textColor = getContrastTextColor(settings.primaryColor)
    vars.push(`--auth-primary-btn-text: ${textColor};`)
    vars.push(`--auth-primary-btn-hover-text: ${textColor};`)
  }

  if (settings.primaryHoverColor) {
    vars.push(`--brand-hover: ${settings.primaryHoverColor};`)
    vars.push(`--brand-accent-hover: ${settings.primaryHoverColor};`)
    vars.push(`--auth-primary-btn-hover-bg: ${settings.primaryHoverColor};`)
    vars.push(`--auth-primary-btn-hover-border: ${settings.primaryHoverColor};`)
    vars.push(`--auth-primary-btn-hover-text: ${getContrastTextColor(settings.primaryHoverColor)};`)
  }

  if (settings.accentColor) {
    vars.push(`--brand-accent: ${settings.accentColor};`)
  }

  if (settings.accentHoverColor) {
    vars.push(`--brand-accent-hover: ${settings.accentHoverColor};`)
  }

  return vars.length > 0 ? `:root { ${vars.join(' ')} }` : ''
}

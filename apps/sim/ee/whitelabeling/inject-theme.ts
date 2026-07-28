import { getContrastTextColor, isDarkColor } from '@/lib/colors'
import { getBrandConfig } from './branding'

export function generateThemeCSS(): string {
  const cssVars: string[] = []
  const brandConfig = getBrandConfig()

  // Use environment variables if set, otherwise fall back to branding.ts defaults
  const primaryColor =
    process.env.NEXT_PUBLIC_BRAND_PRIMARY_COLOR || brandConfig.theme?.primaryColor
  const primaryHoverColor =
    process.env.NEXT_PUBLIC_BRAND_PRIMARY_HOVER_COLOR || brandConfig.theme?.primaryHoverColor
  const secondaryColor =
    process.env.NEXT_PUBLIC_BRAND_SECONDARY_COLOR || brandConfig.theme?.secondaryColor
  const accentColor = process.env.NEXT_PUBLIC_BRAND_ACCENT_COLOR || brandConfig.theme?.accentColor
  const accentHoverColor =
    process.env.NEXT_PUBLIC_BRAND_ACCENT_HOVER_COLOR || brandConfig.theme?.accentHoverColor

  if (primaryColor) {
    cssVars.push(`--brand: ${primaryColor};`)
    // Override brand-accent so Run/Deploy buttons and other accent-styled elements use the brand color
    cssVars.push(`--brand-accent: ${primaryColor};`)
  }

  if (primaryHoverColor) {
    cssVars.push(`--brand-hover: ${primaryHoverColor};`)
  }
  if (process.env.NEXT_PUBLIC_BRAND_PRIMARY_COLOR) {
    // cssVars.push(`--brand: ${process.env.NEXT_PUBLIC_BRAND_PRIMARY_COLOR};`)
    // cssVars.push(`--brand-accent: ${process.env.NEXT_PUBLIC_BRAND_PRIMARY_COLOR};`)
    cssVars.push(`--brand-agent: ${process.env.NEXT_PUBLIC_BRAND_PRIMARY_COLOR};`)
    cssVars.push(`--auth-primary-btn-bg: ${process.env.NEXT_PUBLIC_BRAND_PRIMARY_COLOR};`)
    cssVars.push(`--auth-primary-btn-border: ${process.env.NEXT_PUBLIC_BRAND_PRIMARY_COLOR};`)
    cssVars.push(`--auth-primary-btn-hover-bg: ${process.env.NEXT_PUBLIC_BRAND_PRIMARY_COLOR};`)
    cssVars.push(`--auth-primary-btn-hover-border: ${process.env.NEXT_PUBLIC_BRAND_PRIMARY_COLOR};`)
    const primaryTextColor = getContrastTextColor(process.env.NEXT_PUBLIC_BRAND_PRIMARY_COLOR)
    cssVars.push(`--auth-primary-btn-text: ${primaryTextColor};`)
    cssVars.push(`--auth-primary-btn-hover-text: ${primaryTextColor};`)
  }

  if (process.env.NEXT_PUBLIC_BRAND_PRIMARY_HOVER_COLOR) {
    // cssVars.push(`--brand-hover: ${process.env.NEXT_PUBLIC_BRAND_PRIMARY_HOVER_COLOR};`)
    cssVars.push(`--brand-accent-hover: ${process.env.NEXT_PUBLIC_BRAND_PRIMARY_HOVER_COLOR};`)
    cssVars.push(
      `--auth-primary-btn-hover-bg: ${process.env.NEXT_PUBLIC_BRAND_PRIMARY_HOVER_COLOR};`
    )
    cssVars.push(
      `--auth-primary-btn-hover-border: ${process.env.NEXT_PUBLIC_BRAND_PRIMARY_HOVER_COLOR};`
    )
    cssVars.push(
      `--auth-primary-btn-hover-text: ${getContrastTextColor(process.env.NEXT_PUBLIC_BRAND_PRIMARY_HOVER_COLOR)};`
    )
  }

  if (secondaryColor) {
    cssVars.push(`--brand-secondary-hex: ${secondaryColor};`)
  }

  if (accentColor) {
    cssVars.push(`--brand-link: ${accentColor};`)
    // cssVars.push(`--brand-accent: ${accentColor};`)
  }

  if (accentHoverColor) {
    cssVars.push(`--brand-link-hover: ${accentHoverColor};`)
    // cssVars.push(`--brand-accent-hover: ${accentHoverColor};`)
  }

  if (process.env.NEXT_PUBLIC_CUSTOM_CSS_URL) {
    cssVars.push('--brand-agent: var(--brand);')
  }

  if (process.env.NEXT_PUBLIC_BRAND_BACKGROUND_COLOR) {
    const isDark = isDarkColor(process.env.NEXT_PUBLIC_BRAND_BACKGROUND_COLOR)
    if (isDark) {
      cssVars.push(`--brand-is-dark: 1;`)
    }
  }

  return cssVars.length > 0 ? `:root { ${cssVars.join(' ')} }` : ''
}

import { getEnv } from '@/lib/env'

export interface BrandConfig {
  name: string
  logoUrl?: string
  faviconUrl?: string
  customCssUrl?: string
  supportEmail?: string
  documentationUrl?: string
  termsUrl?: string
  privacyUrl?: string
}

/**
 * Default brand configuration values
 */
const defaultConfig: BrandConfig = {
  name: 'P2 Agents',
  logoUrl: 'https://arenav2image.s3.us-west-1.amazonaws.com/arena_svg_white.svg',
  faviconUrl: '/sim.svg',
  customCssUrl: undefined,
  supportEmail: 'arenadeveloper@position2.com',
  documentationUrl: undefined,
  termsUrl: undefined,
  privacyUrl: undefined,
}

/**
 * Get branding configuration from environment variables
 * Supports runtime configuration via Docker/Kubernetes
 */
export const getBrandConfig = (): BrandConfig => {
  return {
    name: getEnv('NEXT_PUBLIC_BRAND_NAME') || defaultConfig.name,
    logoUrl: getEnv('NEXT_PUBLIC_BRAND_LOGO_URL') || defaultConfig.logoUrl,
    faviconUrl: getEnv('NEXT_PUBLIC_BRAND_FAVICON_URL') || defaultConfig.faviconUrl,
    customCssUrl: getEnv('NEXT_PUBLIC_CUSTOM_CSS_URL') || defaultConfig.customCssUrl,
    supportEmail: getEnv('NEXT_PUBLIC_SUPPORT_EMAIL') || defaultConfig.supportEmail,
    documentationUrl: getEnv('NEXT_PUBLIC_DOCUMENTATION_URL') || defaultConfig.documentationUrl,
    termsUrl: getEnv('NEXT_PUBLIC_TERMS_URL') || defaultConfig.termsUrl,
    privacyUrl: getEnv('NEXT_PUBLIC_PRIVACY_URL') || defaultConfig.privacyUrl,
  }
}

/**
 * Hook to use brand configuration in React components
 */
export const useBrandConfig = () => {
  return getBrandConfig()
}

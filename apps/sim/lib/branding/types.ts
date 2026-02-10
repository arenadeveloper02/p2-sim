export interface ThemeColors {
  primaryColor?: string
  primaryHoverColor?: string
  secondaryColor?: string
  accentColor?: string
  accentHoverColor?: string
  backgroundColor?: string
}

export interface BrandConfig {
  name: string
  logoUrl?: string
  logoUrlBlacktext?: string
  faviconUrl?: string
  customCssUrl?: string
  supportEmail?: string
  documentationUrl?: string
  termsUrl?: string
  privacyUrl?: string
  theme?: ThemeColors
}

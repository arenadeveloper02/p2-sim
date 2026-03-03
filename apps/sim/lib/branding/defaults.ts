import type { BrandConfig } from './types'

/**
 * Default brand configuration values
 */
export const defaultBrandConfig: BrandConfig = {
  name: 'Agentic AI Builder | Arena',
  logoUrl: 'https://arenav2image.s3.us-west-1.amazonaws.com/arena_svg_white.svg',
  logoUrlBlacktext:
    'https://arenav2image.s3.us-west-1.amazonaws.com/rt/calibrate/Arena_Logo_WebDashboard.svg',
  faviconUrl: '/sim.svg',
  customCssUrl: undefined,
  supportEmail: 'arenadeveloper@position2.com',
  documentationUrl: undefined,
  termsUrl: 'https://help.thearena.ai/terms-use',
  privacyUrl: 'https://help.thearena.ai/privacy-policy',
  theme: {
    primaryColor: '#1a73e8',
    primaryHoverColor: '#155cba',
    secondaryColor: '#488fed',
    accentColor: '#76abf1',
    accentHoverColor: '#a3c7f6',
    backgroundColor: '#F3F8FE',
  },
}

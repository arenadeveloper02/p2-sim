import type { MetadataRoute } from 'next'
import { getEnv } from '@/lib/core/config/env'
import { isSearchIndexableAppUrl, SITE_URL } from '@/lib/core/utils/urls'

const DISALLOWED_PATHS = [
  '/api/',
  '/workspace/',
  '/playground/',
  '/resume/',
  '/invite/',
  '/unsubscribe/',
  '/w/',
  '/_next/',
  '/private/',
]

export default function robots(): MetadataRoute.Robots {
  // Dev / test / sandbox share the same image; only prod agent may be crawled.
  if (!isSearchIndexableAppUrl(getEnv('NEXT_PUBLIC_APP_URL'))) {
    return {
      rules: { userAgent: '*', disallow: '/' },
    }
  }

  return {
    rules: { userAgent: '*', allow: '/', disallow: DISALLOWED_PATHS },
    sitemap: [
      `${SITE_URL}/sitemap.xml`,
      `${SITE_URL}/blog/sitemap-images.xml`,
      `${SITE_URL}/library/sitemap-images.xml`,
    ],
  }
}

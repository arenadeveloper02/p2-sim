'use client'

import type { ReactNode } from 'react'
import { TrackingConsentProvider } from '@/lib/consent/tracking-consent'
import { ConsentStoreProvider } from '@/app/_shell/consent/consent-store-provider'
import { GoogleAnalyticsPageViewTracker } from '@/app/_shell/consent/google-analytics-page-view-tracker'

interface ConsentProviderProps {
  children: ReactNode
}

/**
 * Owns hosted Sim's consent lifecycle across every route.
 *
 * The cookie banner is commented off until Arena legal/cookie policy is
 * finalized. Restore `ConsentBanner` after that review.
 */
export function ConsentProvider({ children }: ConsentProviderProps) {
  return (
    <ConsentStoreProvider>
      <TrackingConsentProvider>
        {children}
        <GoogleAnalyticsPageViewTracker />
        {/* <ConsentBanner /> */}
      </TrackingConsentProvider>
    </ConsentStoreProvider>
  )
}

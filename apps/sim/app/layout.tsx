import { Suspense } from 'react'
import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { PublicEnvScript as RuntimePublicEnvScript } from 'next-runtime-env'
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import { BrandedLayout } from '@/components/branded-layout'
import { PostHogProvider } from '@/app/_shell/providers/posthog-provider'
import { generateBrandedMetadata, generateThemeCSS } from '@/ee/whitelabeling'
import '@/app/_styles/globals.css'
import { getEnv } from '@/lib/core/config/env'
import {
  isChatEnabled,
  isHosted,
  isReactGrabEnabled,
  isReactScanEnabled,
} from '@/lib/core/config/env-flags'
import { DesktopUpdateGate } from '@/app/_shell/desktop-update-gate'
import { BlockingInitScripts } from '@/app/_shell/blocking-init-scripts'
import { HydrationErrorHandler } from '@/app/_shell/hydration-error-handler'
import { AutoLoginProvider } from '@/app/_shell/providers/auto-login-provider'
import { AutoLoginSessionMigrationProvider } from '@/app/_shell/providers/auto-login-session-migration-provider'
import { QueryProvider } from '@/app/_shell/providers/query-provider'
import { SessionProvider } from '@/app/_shell/providers/session-provider'
import { ThemeProvider } from '@/app/_shell/providers/theme-provider'
import { TooltipProvider } from '@/app/_shell/providers/tooltip-provider'
import { PublicEnvScript } from '@/app/_shell/public-env-script'
import { ResumePathSync } from '@/app/_shell/resume-path-sync'
import { season } from '@/app/_styles/fonts/season/season'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0c0c0c' },
  ],
}

export const metadata: Metadata = generateBrandedMetadata()

const GTM_ID = 'GTM-T7PHSRX5' as const
const GA_ID = 'G-DR7YBE70VS' as const

/**
 * Static PublicEnvScript is only safe when public env is fixed per image build
 * (sim.ai hosted). Arena agent hosts share one GHCR image across envs and must
 * inject `NEXT_PUBLIC_*` at request time via next-runtime-env.
 */
function useRuntimePublicEnvScript(): boolean {
  const appUrl = getEnv('NEXT_PUBLIC_APP_URL')
  return appUrl !== 'https://www.sim.ai' && appUrl !== 'https://www.staging.sim.ai'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const themeCSS = generateThemeCSS()

  return (
    <html lang='en' suppressHydrationWarning>
      <head>
        {isReactScanEnabled && (
          <Script
            src='https://unpkg.com/react-scan/dist/auto.global.js'
            crossOrigin='anonymous'
            strategy='beforeInteractive'
          />
        )}
        {isReactGrabEnabled && (
          <Script
            src='https://unpkg.com/react-grab/dist/index.global.js'
            crossOrigin='anonymous'
            strategy='beforeInteractive'
          />
        )}
        {isReactGrabEnabled && (
          <Script
            src='https://unpkg.com/@react-grab/cursor/dist/client.global.js'
            strategy='lazyOnload'
          />
        )}

        {/* Theme CSS Override */}
        {themeCSS && (
          <style
            id='theme-override'
            dangerouslySetInnerHTML={{
              __html: themeCSS,
            }}
          />
        )}

        {/* Basic head hints that are not covered by the Metadata API */}
        <meta name='color-scheme' content='light dark' />
        <meta name='format-detection' content='telephone=no' />
        <meta httpEquiv='x-ua-compatible' content='ie=edge' />

        {/* Google Tag Manager — hosted only */}
        {isHosted && (
          <Script
            id='gtm'
            strategy='afterInteractive'
            dangerouslySetInnerHTML={{
              __html: `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`,
            }}
          />
        )}

        {/* Google Analytics (gtag.js) — hosted only */}
        {isHosted && (
          <>
            <Script
              id='gtag-src'
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy='afterInteractive'
            />
            <Script
              id='gtag-init'
              strategy='afterInteractive'
              dangerouslySetInnerHTML={{
                __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_ID}');`,
              }}
            />
          </>
        )}

        {useRuntimePublicEnvScript() ? <RuntimePublicEnvScript /> : <PublicEnvScript />}
      </head>
      <body className={`${season.variable} font-season`} suppressHydrationWarning>
        <BlockingInitScripts isChatEnabled={isChatEnabled} />
        {/* Google Tag Manager (noscript) — hosted only */}
        {isHosted && (
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
              title='Google Tag Manager'
              height='0'
              width='0'
              className='invisible hidden'
            />
          </noscript>
        )}
        <HydrationErrorHandler />
        <Suspense fallback={null}>
          <ResumePathSync />
        </Suspense>
        <DesktopUpdateGate />
        <NuqsAdapter>
          <PostHogProvider>
            <ThemeProvider>
              <QueryProvider>
                <SessionProvider>
                  <AutoLoginSessionMigrationProvider>
                    <AutoLoginProvider>
                      <TooltipProvider>
                        <BrandedLayout>{children}</BrandedLayout>
                      </TooltipProvider>
                    </AutoLoginProvider>
                  </AutoLoginSessionMigrationProvider>
                </SessionProvider>
              </QueryProvider>
            </ThemeProvider>
          </PostHogProvider>
        </NuqsAdapter>
      </body>
    </html>
  )
}

'use client'

import { usePathname } from 'next/navigation'
import type { ThemeProviderProps } from 'next-themes'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  const pathname = usePathname()

  // Force light mode on public/marketing pages, allow user preference elsewhere
  const isLightModePage =
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/signup') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/sso') ||
    pathname.startsWith('/terms') ||
    pathname.startsWith('/privacy') ||
    pathname.startsWith('/invite') ||
    pathname.startsWith('/verify') ||
    pathname.startsWith('/changelog') ||
    pathname.startsWith('/chat') ||
    pathname.startsWith('/blog') ||
    pathname.startsWith('/resume') ||
    pathname.startsWith('/oauth') ||
    pathname.startsWith('/f/') ||
    pathname.startsWith('/unsubscribe')

  const forcedTheme = isLightModePage ? 'light' : undefined
  /**
   * React 19 warns when next-themes renders a `<script>` during client replay.
   * SSR still emits the real blocking script; the client pass uses a non-JS type
   * so React does not try to execute it again.
   */
  const scriptProps =
    typeof window === 'undefined' ? undefined : ({ type: 'application/json' } as const)

  return (
    <NextThemesProvider
      attribute='class'
      defaultTheme='light'
      enableSystem={false}
      disableTransitionOnChange
      storageKey='sim-theme'
      scriptProps={scriptProps}
      {...(isLightModePage && { forcedTheme: 'light' })}
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}

'use client'

import type { ThemeProviderProps } from 'next-themes'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider
      attribute='class'
      defaultTheme='light'
      value={{ light: 'light' }} // 👈 Restrict themes to only light
      enableSystem={false}
      disableTransitionOnChange
      storageKey='sim-theme'
      {...props}
    >
      {children}
    </NextThemesProvider>
  )
}

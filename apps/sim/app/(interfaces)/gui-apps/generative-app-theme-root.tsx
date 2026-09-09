'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useTheme } from 'next-themes'
import {
  type ArenaGenerativeTheme,
  arenaGenerativeThemeStyle,
} from '@/lib/arena-generative-ui/theme'
import { getThemeFromNextThemes } from '@/lib/core/utils/theme'
import '@/app/(interfaces)/gui-apps/generative-app-theme.css'

type GuiColorScheme = 'light' | 'dark'

interface GenerativeAppThemeRootProps {
  theme?: ArenaGenerativeTheme
  children: ReactNode
}

/**
 * Applies `manifest.theme` as scoped `--gui-*` variables. Color scheme follows
 * the visitor's Sim theme (`localStorage` key `sim-theme`).
 */
export function GenerativeAppThemeRoot({ theme, children }: GenerativeAppThemeRootProps) {
  const { resolvedTheme, theme: nextTheme } = useTheme()
  const [scheme, setScheme] = useState<GuiColorScheme>('light')

  useEffect(() => {
    const syncFromNextThemes = () => {
      const fromNext = resolvedTheme ?? nextTheme
      if (fromNext === 'dark' || fromNext === 'light') {
        setScheme(fromNext)
        return
      }
      setScheme(getThemeFromNextThemes())
    }

    syncFromNextThemes()

    const onStorage = (event: StorageEvent) => {
      if (event.key === 'sim-theme' || event.key === null) {
        setScheme(getThemeFromNextThemes())
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [resolvedTheme, nextTheme])

  return (
    <div
      data-gui-theme={scheme}
      className='min-h-screen'
      style={arenaGenerativeThemeStyle(theme)}
      suppressHydrationWarning
    >
      {children}
    </div>
  )
}

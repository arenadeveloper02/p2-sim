'use client'

import type { ReactNode } from 'react'
import {
  type ArenaGenerativeTheme,
  arenaGenerativeThemeScheme,
  arenaGenerativeThemeStyle,
} from '@/lib/arena-generative-ui/theme'
import '@/app/(interfaces)/gui-apps/generative-app-theme.css'

interface GenerativeAppThemeRootProps {
  theme?: ArenaGenerativeTheme
  children: ReactNode
}

/**
 * Applies `manifest.theme` as scoped `--gui-*` variables. Color scheme is a
 * data attribute so `prefers-color-scheme` can drive `system` without JS.
 */
export function GenerativeAppThemeRoot({ theme, children }: GenerativeAppThemeRootProps) {
  return (
    <div
      data-gui-theme={arenaGenerativeThemeScheme(theme)}
      className='min-h-screen'
      style={arenaGenerativeThemeStyle(theme)}
    >
      {children}
    </div>
  )
}

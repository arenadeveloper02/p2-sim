'use client'

import { type ReactNode, useEffect, useRef } from 'react'
import { useTheme } from 'next-themes'
import { SettingsHeaderProvider, SettingsHeaderShell } from '@/components/settings/settings-header'
import { SettingsSectionProvider } from '@/components/settings/settings-panel'
import { useSettingsBeforeUnload } from '@/components/settings/use-settings-before-unload'
import { ArenaThemeSync } from '@/app/workspace/[workspaceId]/providers/arena-theme-sync'

interface ArenaGeneralSettingsShellProps {
  children: ReactNode
}

const ARENA_EMBED_THEMES = new Set(['light', 'dark', 'system'])

/**
 * Applies `?theme=` once on embed load. Later changes come from the Arena
 * theme SSE listener, which must not be overwritten by a stale query param.
 */
function useArenaEmbedTheme() {
  const { setTheme } = useTheme()
  const appliedRef = useRef(false)

  useEffect(() => {
    if (appliedRef.current) return
    appliedRef.current = true

    const theme = new URLSearchParams(window.location.search).get('theme')
    if (theme && ARENA_EMBED_THEMES.has(theme)) {
      setTheme(theme)
    }
  }, [setTheme])
}

interface ArenaGeneralSettingsShellProps {
  children: ReactNode
}

/**
 * Account-plane chrome for Arena General settings. Same header + panel shell as
 * workspace settings, without a workspace id in the route.
 *
 * This page is a sibling of `[workspaceId]`, so it does not inherit that
 * layout's theme listener. The iframe must subscribe itself or an Arena theme
 * PATCH never updates the embedded document.
 */
export function ArenaGeneralSettingsShell({ children }: ArenaGeneralSettingsShellProps) {
  useSettingsBeforeUnload()
  useArenaEmbedTheme()

  return (
    <div className='flex h-screen w-full overflow-hidden bg-[var(--bg)]'>
      <ArenaThemeSync />
      <SettingsHeaderProvider>
        <SettingsHeaderShell>
          <SettingsSectionProvider section='general' meta={{ label: '', description: '' }}>
            {children}
          </SettingsSectionProvider>
        </SettingsHeaderShell>
      </SettingsHeaderProvider>
    </div>
  )
}

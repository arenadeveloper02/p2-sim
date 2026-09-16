'use client'

import type { ReactNode } from 'react'
import { SettingsHeaderProvider, SettingsHeaderShell } from '@/components/settings/settings-header'
import { SettingsSectionProvider } from '@/components/settings/settings-panel'
import { useSettingsBeforeUnload } from '@/components/settings/use-settings-before-unload'

interface ArenaGeneralSettingsShellProps {
  children: ReactNode
}

/**
 * Account-plane chrome for Arena General settings. Same header + panel shell as
 * workspace settings, without a workspace id in the route.
 */
export function ArenaGeneralSettingsShell({ children }: ArenaGeneralSettingsShellProps) {
  useSettingsBeforeUnload()

  return (
    <div className='flex h-screen w-full overflow-hidden bg-[var(--bg)]'>
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

'use client'

import type { ReactNode } from 'react'
import { Suspense } from 'react'
import { useSettingsBeforeUnload } from '@/components/settings/use-settings-before-unload'
import { SettingsLayoutShell } from '@/app/workspace/[workspaceId]/settings/settings-layout-shell'
import { SettingsLayoutShellFallback } from '@/app/workspace/[workspaceId]/settings/settings-layout-shell-fallback'

export default function SettingsLayout({ children }: { children: ReactNode }) {
  useSettingsBeforeUnload()
  return (
    <Suspense fallback={<SettingsLayoutShellFallback>{children}</SettingsLayoutShellFallback>}>
      <SettingsLayoutShell>{children}</SettingsLayoutShell>
    </Suspense>
  )
}

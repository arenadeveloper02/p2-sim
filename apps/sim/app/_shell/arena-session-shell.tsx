'use client'

import type { ReactNode } from 'react'
import { AutoLoginProvider } from '@/app/_shell/providers/auto-login-provider'
import { AutoLoginSessionMigrationProvider } from '@/app/_shell/providers/auto-login-session-migration-provider'

interface ArenaSessionShellProps {
  children: ReactNode
}

/**
 * Arena session bootstrap that must wrap the product tree: cookie-scope
 * migration, then email-cookie auto-login. Isolated from `app/layout.tsx` so
 * upstream provider-tree edits do not re-conflict with these wrappers.
 */
export function ArenaSessionShell({ children }: ArenaSessionShellProps) {
  return (
    <AutoLoginSessionMigrationProvider>
      <AutoLoginProvider>{children}</AutoLoginProvider>
    </AutoLoginSessionMigrationProvider>
  )
}

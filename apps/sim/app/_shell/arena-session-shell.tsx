'use client'

import type { ReactNode } from 'react'
import { AutoLoginSessionMigrationProvider } from '@/app/_shell/providers/auto-login-session-migration-provider'

interface ArenaSessionShellProps {
  children: ReactNode
}

/**
 * Arena session bootstrap that must wrap the product tree: one-time cookie-scope
 * migration before the rest of the app mounts. Isolated from `app/layout.tsx` so
 * upstream provider-tree edits do not re-conflict with these wrappers.
 */
export function ArenaSessionShell({ children }: ArenaSessionShellProps) {
  return <AutoLoginSessionMigrationProvider>{children}</AutoLoginSessionMigrationProvider>
}

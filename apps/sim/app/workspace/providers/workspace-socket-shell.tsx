'use client'

import { useSession } from '@/lib/auth/auth-client'
import { SocketProvider } from '@/app/workspace/providers/socket-provider'

interface WorkspaceSocketShellProps {
  children: React.ReactNode
}

/**
 * Passes workspace `{children}` through `SocketProvider` with no extra DOM.
 * Wrapping the children slot in a Client Component element mismatches React 19
 * streaming `<script>` tags on hydrate.
 */
export function WorkspaceSocketShell({ children }: WorkspaceSocketShellProps) {
  const session = useSession()

  const user = session.data?.user
    ? {
        id: session.data.user.id,
        name: session.data.user.name ?? undefined,
        email: session.data.user.email,
      }
    : undefined

  return <SocketProvider user={user}>{children}</SocketProvider>
}

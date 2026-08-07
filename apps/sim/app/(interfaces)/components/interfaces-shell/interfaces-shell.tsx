import type { ReactNode } from 'react'
import Image from 'next/image'
import { SupportFooter } from '@/app/(auth)/components'
import arenaLogo from '@/app/(interfaces)/chat/components/message/components/ArenaLogo.svg'
import { LogoShell } from '@/app/(landing)/components'

/**
 * Chrome for the `(interfaces)` route group (chat + resume) — the lightweight,
 * logo-only frame their entry/gate screens wear (chat email / password auth, the
 * embedded SSO gate, the "chat unavailable" message, and the resume gate).
 *
 * It is the shared {@link LogoShell} (light, logo-only header) plus a
 * {@link SupportFooter}. Content is full-width — gate forms center themselves;
 * the live chat UI renders a `fixed inset-0` overlay that covers this frame, and
 * voice mode is full-screen — so the frame is only ever visible on the
 * gate/message states, giving chat and resume the same chrome as the auth pages.
 */
interface InterfacesShellProps {
  children: ReactNode
}

export function InterfacesShell({ children }: InterfacesShellProps) {
  return (
    <LogoShell
      footer={<SupportFooter position='static' />}
      logo={<Image src={arenaLogo} alt='Arena' width={30} height={30} priority />}
      logoLabel='Arena home'
    >
      {children}
    </LogoShell>
  )
}

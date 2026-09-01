import type { ReactNode } from 'react'
import { InterfacesShell } from '@/app/(interfaces)/components'

/**
 * Route-group layout for runtime interfaces — chat (`/chat/:identifier`),
 * resume (`/resume/...`), and generated GUI apps (`/gui-apps/...`).
 * {@link InterfacesShell} is logo-only chrome for chat/resume gates; `/gui-apps`
 * skips that header so AppHeader is the only top bar. Immersive chat states
 * (the live overlay, voice mode) render full-screen on top of this frame.
 */
export default function InterfacesLayout({ children }: { children: ReactNode }) {
  return <InterfacesShell>{children}</InterfacesShell>
}

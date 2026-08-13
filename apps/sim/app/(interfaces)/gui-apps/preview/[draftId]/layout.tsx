import type { ReactNode } from 'react'
import { GenerativeAppHostStateProvider } from '@/app/(interfaces)/gui-apps/generative-app-host-state'

export default function GenerativeAppDraftPreviewLayout({ children }: { children: ReactNode }) {
  return <GenerativeAppHostStateProvider>{children}</GenerativeAppHostStateProvider>
}

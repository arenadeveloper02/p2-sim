import type { ReactNode } from 'react'
import { poppins } from '@/app/_styles/fonts/poppins/poppins'
import { GenerativeAppHostStateProvider } from '@/app/(interfaces)/gui-apps/generative-app-host-state'
import '@/app/(interfaces)/chat/arena-tokens.css'

export default function GenerativeAppLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`deployed-chat min-h-screen ${poppins.variable} ${poppins.className} font-poppins`}
    >
      <GenerativeAppHostStateProvider>{children}</GenerativeAppHostStateProvider>
    </div>
  )
}

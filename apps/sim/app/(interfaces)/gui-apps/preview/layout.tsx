import type { ReactNode } from 'react'
import { poppins } from '@/app/_styles/fonts/poppins/poppins'
import '@/app/(interfaces)/chat/arena-tokens.css'
import '@/app/(interfaces)/gui-apps/generative-app-theme.css'

export default function GenerativeAppPreviewLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={`deployed-chat min-h-screen ${poppins.variable} ${poppins.className} font-poppins`}
    >
      {children}
    </div>
  )
}

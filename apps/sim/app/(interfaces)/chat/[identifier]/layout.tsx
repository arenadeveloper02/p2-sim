import { poppins } from '@/app/_styles/fonts/poppins/poppins'
import '@/app/(interfaces)/chat/arena-tokens.css'
import { DeployedChatThemeSync } from '@/app/(interfaces)/chat/[identifier]/deployed-chat-theme-sync'

export default function DeployedChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`deployed-chat deployed-chat-root ${poppins.variable} ${poppins.className} font-poppins`}
    >
      <DeployedChatThemeSync />
      {children}
    </div>
  )
}

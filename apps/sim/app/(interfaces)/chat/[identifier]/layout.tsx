import { poppins } from '@/app/_styles/fonts/poppins/poppins'
import '@/app/(interfaces)/chat/arena-tokens.css'

export default function DeployedChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`deployed-chat ${poppins.variable} ${poppins.className} font-poppins`}>
      {children}
    </div>
  )
}

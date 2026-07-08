import { poppins } from '@/app/_styles/fonts/poppins/poppins'

export default function DeployedChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${poppins.variable} ${poppins.className} font-poppins`}>{children}</div>
  )
}

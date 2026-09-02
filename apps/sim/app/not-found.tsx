import { ChipLink } from '@sim/emcn'
import type { Metadata } from 'next'
import Image from 'next/image'
import { StatusPageContent } from '@/components/status-page'
import arenaLogo from '@/app/(interfaces)/chat/components/message/components/ArenaLogo.svg'
import { LogoShell } from '@/app/(landing)/components'

export const metadata: Metadata = {
  title: 'Page Not Found',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <LogoShell
      center
      logo={<Image src={arenaLogo} alt='Arena' width={30} height={30} priority />}
      logoLabel='Arena home'
    >
      <StatusPageContent
        title='Page not found'
        description="The page you're looking for doesn't exist or has been moved."
      >
        <ChipLink variant='primary' href='/'>
          Return home
        </ChipLink>
      </StatusPageContent>
    </LogoShell>
  )
}

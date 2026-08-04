'use client'

import { Button } from '@sim/emcn'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import arenaLogo from '@/app/(interfaces)/chat/components/message/components/ArenaLogo.svg'

interface ChatErrorStateProps {
  error: string
}

export function ChatErrorState({ error }: ChatErrorStateProps) {
  const router = useRouter()

  return (
    <div className='flex flex-1 items-center justify-center px-4 py-16 text-center'>
      <div className='flex w-full max-w-[410px] flex-col items-center gap-3'>
        <Image src={arenaLogo} alt='Arena Logo' width={48} height={48} className='mb-3' />
        <h1 className='text-balance text-[40px] text-[var(--text-primary)] leading-[110%] tracking-[-0.02em]'>
          Chat Unavailable
        </h1>
        <p className='text-[var(--text-muted)] text-lg'>{error}</p>
        <Button
          variant='primary'
          onClick={() => router.push('/workspace')}
          className='h-[32px] w-full gap-2 px-2.5 text-sm'
        >
          Return to Workspace
        </Button>
      </div>
    </div>
  )
}

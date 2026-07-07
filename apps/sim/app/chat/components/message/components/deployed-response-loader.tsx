'use client'

import Image from 'next/image'
import circlePatternLoader from '@/app/chat/components/message/components/circle-pattern-loader.gif'

interface DeployedResponseLoaderProps {
  /** When true, show "Fetching..." instead of "Thinking..." */
  isStreaming?: boolean
}

/**
 * Loading indicator shown in deployed chat while waiting for an assistant response.
 */
export function DeployedResponseLoader({ isStreaming = false }: DeployedResponseLoaderProps) {
  const label = isStreaming ? 'Fetching' : 'Thinking'

  return (
    <div className='px-4 py-5'>
      <div className='mx-auto max-w-3xl'>
        <div className='flex items-center gap-3'>
          <Image
            src={circlePatternLoader}
            alt=''
            width={64}
            height={64}
            unoptimized
            aria-hidden
          />
          <span className='font-medium text-muted-foreground text-sm'>{label}...</span>
        </div>
      </div>
    </div>
  )
}

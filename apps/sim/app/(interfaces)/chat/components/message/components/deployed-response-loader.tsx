'use client'

import { cn } from '@sim/emcn'
import Image from 'next/image'
import circlePatternLoader from '@/app/(interfaces)/chat/components/message/components/circle-pattern-loader.gif'
import { DEPLOYED_CHAT_TEXT_MUTED } from '@/app/(interfaces)/chat/constants'

interface DeployedResponseLoaderProps {
  /** Loader edge length in px. Response default is 96; page load uses 160. */
  size?: number
  className?: string
}

/**
 * Loading indicator shown in deployed chat while waiting for an assistant response.
 */
export function DeployedResponseLoader({ size = 96, className }: DeployedResponseLoaderProps) {
  return (
    <div className={cn('py-4', className)}>
      <div className='flex items-center justify-center'>
        <Image
          src={circlePatternLoader}
          alt='Loading response'
          width={size}
          height={size}
          unoptimized
          className='mix-blend-multiply'
        />
      </div>
    </div>
  )
}

/**
 * Compact inline loader for deployed chat streaming states (e.g. fetching references).
 */
export function DeployedInlineLoader({ label }: { label: string }) {
  return (
    <div
      className='mt-2 flex items-center gap-2.5 text-sm'
      style={{ color: DEPLOYED_CHAT_TEXT_MUTED }}
    >
      <Image
        src={circlePatternLoader}
        alt=''
        width={24}
        height={24}
        unoptimized
        aria-hidden
        className='mix-blend-multiply'
      />
      <span className='font-medium'>{label}</span>
    </div>
  )
}

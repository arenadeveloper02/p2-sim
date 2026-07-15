'use client'

import Image from 'next/image'
import { DEPLOYED_CHAT_TEXT_MUTED } from '@/app/chat/constants'
import circlePatternLoader from '@/app/chat/components/message/components/circle-pattern-loader.gif'

/**
 * Loading indicator shown in deployed chat while waiting for an assistant response.
 */
export function DeployedResponseLoader() {
  return (
    <div className='py-4'>
      <div className='flex items-center'>
        <Image
          src={circlePatternLoader}
          alt='Loading response'
          width={48}
          height={48}
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
    <div className='mt-2 flex items-center gap-2.5 text-sm' style={{ color: DEPLOYED_CHAT_TEXT_MUTED }}>
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

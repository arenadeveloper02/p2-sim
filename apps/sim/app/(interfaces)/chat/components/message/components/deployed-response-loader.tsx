'use client'

import { cn } from '@sim/emcn'
import Image from 'next/image'
import circlePatternLoader from '@/app/(interfaces)/chat/components/message/components/circle-pattern-loader.gif'
import { DEPLOYED_CHAT_TEXT_MUTED } from '@/app/(interfaces)/chat/constants'

interface DeployedResponseLoaderProps {
  /**
   * Loader edge length in px.
   * Response waiting defaults to 48 (left-aligned with Thinking/Fetching label).
   * Page load overlays pass 160 (centered icon-only via parent wrapper).
   */
  size?: number
  className?: string
  /**
   * When true, show "Fetching..." instead of "Thinking...".
   * Labels are omitted for large page-load sizes (size > 48).
   */
  isStreaming?: boolean
}

/**
 * Loading indicator shown in deployed chat while waiting for an assistant response.
 */
export function DeployedResponseLoader({
  size = 48,
  className,
  isStreaming = false,
}: DeployedResponseLoaderProps) {
  const showLabel = size <= 48
  const label = isStreaming ? 'Fetching' : 'Thinking'

  return (
    <div className={cn('py-4', className)}>
      <div className={cn('flex items-center gap-2.5', size > 48 && 'justify-center')}>
        <Image
          src={circlePatternLoader}
          alt={showLabel ? `${label}...` : 'Loading'}
          width={size}
          height={size}
          unoptimized
          className='mix-blend-multiply'
        />
        {showLabel ? (
          <span className='font-medium text-sm' style={{ color: DEPLOYED_CHAT_TEXT_MUTED }}>
            {label}...
          </span>
        ) : null}
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

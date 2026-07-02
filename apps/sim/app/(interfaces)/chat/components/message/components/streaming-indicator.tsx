'use client'

import { memo } from 'react'
import { cn } from '@/lib/core/utils/cn'

interface StreamingIndicatorProps {
  className?: string
}

export const StreamingIndicator = memo(({ className }: StreamingIndicatorProps) => (
  <div className={cn('flex h-[1.25rem] items-center text-muted-foreground', className)}>
    <div className='flex space-x-0.5'>
      <div className='h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:0ms] [animation-duration:1.2s]' />
      <div className='h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:150ms] [animation-duration:1.2s]' />
      <div className='h-1 w-1 animate-bounce rounded-full bg-muted-foreground [animation-delay:300ms] [animation-duration:1.2s]' />
    </div>
  </div>
))

StreamingIndicator.displayName = 'StreamingIndicator'

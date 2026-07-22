'use client'

import { cn } from '@sim/emcn'
import { parseWelcomeSegments } from '@/app/(interfaces)/chat/utils/welcome-message-ctas'

export type WelcomeMessageCtaVariant = 'chat' | 'landing'

interface WelcomeMessageWithCtasProps {
  content: string
  onQueryClick?: (query: string) => void
  className?: string
  /**
   * `chat` matches in-message welcome chips; `landing` is inline brand-link CTAs
   * inside muted landing / modal body copy.
   */
  variant?: WelcomeMessageCtaVariant
}

/**
 * Renders welcome-message text with `{{query}}` tokens as clickable CTAs.
 */
export function WelcomeMessageWithCtas({
  content,
  onQueryClick,
  className,
  variant = 'landing',
}: WelcomeMessageWithCtasProps) {
  const segments = parseWelcomeSegments(content).filter(
    (s) => s.type !== 'text' || s.value.length > 0
  )

  if (variant === 'chat') {
    return (
      <div className={cn('flex max-w-full flex-col gap-0.25 break-words', className)}>
        {segments.map((segment, index) => {
          if (segment.type === 'text') {
            return (
              <span key={`w-text-${index}`} className='whitespace-pre-wrap'>
                {segment.value}
              </span>
            )
          }
          return (
            <button
              key={`w-query-${index}`}
              type='button'
              className='w-fit max-w-full cursor-pointer self-start rounded-md bg-[var(--surface-1)] px-2.5 py-1 text-left font-medium text-[var(--text-primary)] shadow-[0_3px_10px_rgba(0,0,0,0.18)] transition-all duration-150 ease-out hover:bg-[var(--surface-4)] hover:text-[1.02em] hover:shadow-[0_6px_14px_rgba(0,0,0,0.22)] active:translate-y-px active:shadow-sm'
              onClick={() => onQueryClick?.(segment.value)}
              title='Run this query'
            >
              {segment.value}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <span className={cn('whitespace-pre-wrap', className)}>
      {segments.map((segment, index) => {
        if (segment.type === 'text') {
          return <span key={`w-text-${index}`}>{segment.value}</span>
        }
        return (
          <button
            key={`w-query-${index}`}
            type='button'
            className='inline cursor-pointer rounded-sm border-0 bg-transparent p-0 font-medium text-[var(--color-ds-text-link-hover,#155CBA)] underline decoration-[var(--color-ds-text-link-hover,#155CBA)]/40 underline-offset-2 transition-colors hover:decoration-[var(--color-ds-text-link-hover,#155CBA)]'
            onClick={() => onQueryClick?.(segment.value)}
            title='Run this query'
          >
            {segment.value}
          </button>
        )
      })}
    </span>
  )
}

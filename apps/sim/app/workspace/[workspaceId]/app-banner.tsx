'use client'

import { useEffect } from 'react'
import { AlertTriangle } from 'lucide-react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Banner } from '@/components/emcn'
import { cn } from '@/lib/core/utils/cn'
import { useAppBanner } from '@/hooks/queries/app-banner'

/**
 * Full-width warning-styled strip below the browser chrome when the platform exposes banner text via GET /api/app/banner.
 */
export function AppBanner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { data, isPending, refetch } = useAppBanner()

  useEffect(() => {
    void refetch()
  }, [pathname, searchParams, refetch])

  if (isPending) {
    return null
  }

  const message = data?.message?.trim()
  if (!message) {
    return null
  }

  return (
    <Banner
      role='status'
      aria-live='polite'
      className={cn(
        'border-t border-b border-[var(--terminal-status-warning-border)]',
        'bg-[var(--terminal-status-warning-bg)] py-2'
      )}
    >
      <div className='mx-auto flex items-start justify-center gap-2.5 px-6 sm:items-center'>
        <AlertTriangle
          className='mt-0.5 h-[15px] w-[15px] shrink-0 text-[var(--terminal-status-warning-color)] sm:mt-0'
          aria-hidden
          strokeWidth={2}
        />
        <p className='text-left text-[13px] font-medium leading-relaxed text-[var(--terminal-status-warning-color)]'>
          {message}
        </p>
      </div>
    </Banner>
  )
}

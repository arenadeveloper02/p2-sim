'use client'

import { useEffect } from 'react'
import { Info } from 'lucide-react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Banner } from '@/components/emcn'
import { cn } from '@/lib/core/utils/cn'
import { useAppBanner } from '@/hooks/queries/app-banner'

/**
 * Full-width informational strip below the browser chrome when the platform exposes banner text via GET /api/app/banner.
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
        'border-t border-[var(--brand-500)]/45 border-b border-[var(--border-muted)]',
        'bg-[var(--surface-3)] py-2',
        'shadow-[inset_0_1px_0_0_var(--divider)]'
      )}
    >
      <div className='mx-auto flex items-start justify-center gap-2.5 px-6 sm:items-center'>
        <Info
          className='mt-0.5 h-[15px] w-[15px] shrink-0 text-[var(--brand-500)] opacity-90 sm:mt-0'
          aria-hidden
          strokeWidth={2}
        />
        <p
          className='text-left text-[13px] leading-relaxed text-[var(--text-body)]'
        >
          {message}
        </p>
      </div>
    </Banner>
  )
}

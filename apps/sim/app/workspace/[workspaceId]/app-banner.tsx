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
        ' border-t border-b',
        'bg-[#F3F8FE] py-2'
      )}
    >
      <div className='mx-auto flex items-start justify-center gap-2.5 px-6 sm:items-center'>
        <AlertTriangle
          className='mt-0.5 h-[15px] w-[15px] shrink-0 text-[#155CBA] sm:mt-0'
          aria-hidden
          strokeWidth={2}
        />
        <p className='text-left font-medium text-[13px] text-[#155CBA] leading-relaxed'>
          {message}
        </p>
      </div>
    </Banner>
  )
}

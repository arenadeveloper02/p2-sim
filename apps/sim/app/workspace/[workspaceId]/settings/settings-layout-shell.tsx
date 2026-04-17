'use client'

import type { ReactNode } from 'react'
import { useLayoutEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/core/utils/cn'

interface SettingsLayoutShellProps {
  children: ReactNode
}

/**
 * Settings chrome that can adjust surface styling when embedded (Arena iframe)
 * or loaded in a generic iframe, without reading `window` in a Server Component.
 */
export function SettingsLayoutShell({ children }: SettingsLayoutShellProps) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const fromArenaV3 = searchParams.get('from') === 'arena_v3'
  const [inGenericIframe, setInGenericIframe] = useState(false)

  useLayoutEffect(() => {
    setInGenericIframe(typeof window !== 'undefined' && window.self !== window.top)
  }, [])

  const isIntegrationsSection = Boolean(pathname?.includes('/settings/integrations'))
  const useEmbedSurface = isIntegrationsSection && (fromArenaV3 || inGenericIframe)

  return (
    <div
      className={cn(
        'h-full overflow-y-auto [scrollbar-gutter:stable]',
        useEmbedSurface && 'bg-[var(--surface-1)]'
      )}
    >
      <div className='mx-auto flex min-h-full max-w-[940px] flex-col px-[26px] pt-9 pb-[52px]'>
        {children}
      </div>
    </div>
  )
}

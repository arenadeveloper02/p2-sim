'use client'

import { useSyncExternalStore } from 'react'
import { cn } from '@sim/emcn'
import circlePatternLoader from '@/app/(interfaces)/chat/components/message/components/circle-pattern-loader.gif'
import circlePatternLoaderWhite from '@/app/(interfaces)/chat/components/message/components/circle-pattern-loader-white.gif'
import { DEPLOYED_CHAT_TEXT_MUTED } from '@/app/(interfaces)/chat/constants'

/**
 * Dark chat styles come from `html.dark`. Tailwind `dark:` does not swap this
 * GIF reliably here — the custom variant uses `:where()`, so `hidden` wins over
 * `dark:block` and the colored file stays the one that is shown. Read the same
 * class next-themes writes, and point `src` at the white GIF.
 */
function subscribeToThemeClass(onStoreChange: () => void) {
  const root = document.documentElement
  const observer = new MutationObserver(onStoreChange)
  observer.observe(root, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}

function isDarkTheme() {
  return document.documentElement.classList.contains('dark')
}

function LoaderGif({ size, alt }: { size: number; alt: string }) {
  const isDark = useSyncExternalStore(subscribeToThemeClass, isDarkTheme, () => false)
  const source = isDark ? circlePatternLoaderWhite : circlePatternLoader

  return (
    <img
      src={source.src}
      alt={alt}
      width={size}
      height={size}
      className={isDark ? undefined : 'mix-blend-multiply'}
    />
  )
}

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
 * Light theme uses the colored GIF. Dark theme uses the same animation in white.
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
        <LoaderGif size={size} alt={showLabel ? `${label}...` : 'Loading'} />
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
      <LoaderGif size={24} alt='' />
      <span className='font-medium'>{label}</span>
    </div>
  )
}

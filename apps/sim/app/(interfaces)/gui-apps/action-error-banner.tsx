'use client'

interface ActionErrorBannerProps {
  message: string
  onDismiss: () => void
  tone?: 'error' | 'warning'
}

/**
 * Host-level surface for a failed CTA. A generated spec is not required to bind
 * `error` anywhere, so without this the skeletons simply disappear and the page
 * looks unchanged when an action fails.
 */
export function ActionErrorBanner({ message, onDismiss, tone = 'error' }: ActionErrorBannerProps) {
  const isWarning = tone === 'warning'
  return (
    <div
      role={isWarning ? 'status' : 'alert'}
      data-testid={isWarning ? 'action-warning-banner' : 'action-error-banner'}
      className={
        isWarning
          ? 'flex w-full items-start gap-3 border-amber-200 border-b bg-amber-50 px-6 py-3 text-amber-900 text-sm'
          : 'flex w-full items-start gap-3 border-red-200 border-b bg-red-50 px-6 py-3 text-red-800 text-sm'
      }
    >
      <span className='flex-1 break-words'>{message}</span>
      <button
        type='button'
        onClick={onDismiss}
        aria-label={isWarning ? 'Dismiss warning' : 'Dismiss error'}
        className={
          isWarning
            ? 'shrink-0 rounded px-1 text-amber-900/70 leading-none hover:text-amber-950'
            : 'shrink-0 rounded px-1 text-red-800/70 leading-none hover:text-red-900'
        }
      >
        ×
      </button>
    </div>
  )
}

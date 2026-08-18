'use client'

interface ActionErrorBannerProps {
  message: string
  onDismiss: () => void
}

/**
 * Host-level surface for a failed CTA. A generated spec is not required to bind
 * `error` anywhere, so without this the skeletons simply disappear and the page
 * looks unchanged when an action fails.
 */
export function ActionErrorBanner({ message, onDismiss }: ActionErrorBannerProps) {
  return (
    <div
      role='alert'
      data-testid='action-error-banner'
      className='flex w-full items-start gap-3 border-red-200 border-b bg-red-50 px-6 py-3 text-red-800 text-sm'
    >
      <span className='flex-1 break-words'>{message}</span>
      <button
        type='button'
        onClick={onDismiss}
        aria-label='Dismiss error'
        className='shrink-0 rounded px-1 leading-none text-red-800/70 hover:text-red-900'
      >
        ×
      </button>
    </div>
  )
}

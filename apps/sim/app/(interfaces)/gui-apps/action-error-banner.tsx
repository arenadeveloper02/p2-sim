'use client'

import { useEffect } from 'react'

interface ActionErrorBannerProps {
  message: string
  onDismiss: () => void
  onRetry?: () => void
  tone?: 'error' | 'warning'
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/**
 * Host-level surface for a failed CTA. A generated spec is not required to bind
 * `error` anywhere, so without this the skeletons simply disappear and the page
 * looks unchanged when an action fails.
 */
export function ActionErrorBanner({
  message,
  onDismiss,
  onRetry,
  tone = 'error',
}: ActionErrorBannerProps) {
  const isWarning = tone === 'warning'
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || isTypingTarget(event.target)) return
      onDismiss()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onDismiss])

  return (
    <div
      role={isWarning ? 'status' : 'alert'}
      data-testid={isWarning ? 'action-warning-banner' : 'action-error-banner'}
      className={
        isWarning
          ? 'flex w-full items-start gap-3 border-[var(--gui-warning-border,#fdcdb5)] border-b bg-[var(--gui-warning-surface,#fff9f5)] px-6 py-3 text-[var(--gui-warning-text,#974d29)] text-sm'
          : 'flex w-full items-start gap-3 border-[var(--gui-error-border,#faa3a3)] border-b bg-[var(--gui-error-surface,#fff3f3)] px-6 py-3 text-[var(--gui-error-text,#921010)] text-sm'
      }
    >
      <span className='flex-1 break-words'>{message}</span>
      {onRetry && !isWarning ? (
        <button
          type='button'
          data-testid='action-error-retry'
          onClick={onRetry}
          className='shrink-0 rounded-[var(--gui-radius-sm,8px)] px-2 py-0.5 font-medium text-[var(--gui-error-text,#921010)] hover:bg-[var(--gui-surface,#ffffff)]'
        >
          Retry
        </button>
      ) : null}
      <button
        type='button'
        data-testid='action-error-dismiss'
        onClick={onDismiss}
        aria-label={isWarning ? 'Dismiss warning' : 'Dismiss error'}
        className={
          isWarning
            ? 'shrink-0 rounded px-1 text-[var(--gui-warning-text,#974d29)] leading-none hover:text-[var(--gui-text,#2c2d33)]'
            : 'shrink-0 rounded px-1 text-[var(--gui-error-text,#921010)] leading-none hover:text-[var(--gui-text,#2c2d33)]'
        }
      >
        ×
      </button>
    </div>
  )
}

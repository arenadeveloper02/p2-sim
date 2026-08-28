'use client'

import { type KeyboardEvent, useEffect, useRef } from 'react'
import { cn } from '@sim/emcn'
import { GENERATIVE_APP_SUCCESS_TOAST_MS } from '@/lib/arena-generative-ui/action-runtime'

interface ActionSuccessToastProps {
  message: string
  onDone: () => void
}

/**
 * Same-page save confirmation. Does not take focus; auto-dismisses.
 */
export function ActionSuccessToast({ message, onDone }: ActionSuccessToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, GENERATIVE_APP_SUCCESS_TOAST_MS)
    return () => window.clearTimeout(timer)
  }, [onDone])

  return (
    <div
      role='status'
      data-testid='action-success-toast'
      className='pointer-events-none fixed inset-x-0 bottom-6 z-20 flex justify-center px-4'
    >
      <p className='rounded-[var(--gui-radius,12px)] border border-[var(--gui-success-border,#b1e9ce)] bg-[var(--gui-success-surface,#f5fcf9)] px-4 py-2 text-[var(--gui-success-text,#23784f)] text-sm shadow-[var(--gui-shadow-card,0px_2px_8px_rgba(44,45,51,0.1))]'>
        {message}
      </p>
    </div>
  )
}

interface DestructiveConfirmDialogProps {
  onCancel: () => void
  onConfirm: () => void
}

/**
 * Host confirmation before a destructive CTA. Focus moves into the dialog and
 * restores to the trigger on close.
 */
export function DestructiveConfirmDialog({ onCancel, onConfirm }: DestructiveConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onCancel()
      return
    }
    if (event.key !== 'Tab') return
    const buttons = dialogRef.current?.querySelectorAll<HTMLElement>('button')
    if (!buttons || buttons.length === 0) return
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return (
    <div
      className='fixed inset-0 z-30 flex items-center justify-center bg-[rgb(44_45_51_/_40%)] p-4'
      data-testid='destructive-confirm-backdrop'
    >
      <div
        ref={dialogRef}
        role='dialog'
        aria-modal='true'
        aria-labelledby='destructive-confirm-title'
        data-testid='destructive-confirm'
        className='w-full max-w-sm rounded-[var(--gui-radius,12px)] border border-[var(--gui-border,#e2e3e5)] bg-[var(--gui-surface,#ffffff)] p-4 shadow-[var(--gui-shadow-card,0px_2px_8px_rgba(44,45,51,0.1))]'
        onKeyDown={onKeyDown}
      >
        <h2
          id='destructive-confirm-title'
          className='font-medium text-[length:var(--gui-body-size,16px)] text-[var(--gui-text,#2c2d33)]'
        >
          This cannot be undone
        </h2>
        <p className='mt-1 text-[length:var(--gui-label-size,12px)] text-[var(--gui-text-muted,#575a66)]'>
          Continue with this action?
        </p>
        <div className='mt-4 flex justify-end gap-2'>
          <button
            type='button'
            data-testid='destructive-confirm-cancel'
            onClick={onCancel}
            className={cn(
              'inline-flex h-10 items-center rounded-[var(--gui-radius,12px)] border border-[var(--gui-border,#e2e3e5)] px-4 font-medium text-[var(--gui-text,#2c2d33)]',
              'hover:bg-[var(--gui-canvas,#f7f8f9)] focus-visible:outline-2 focus-visible:outline-[var(--gui-brand,#1a73e8)] focus-visible:outline-offset-2'
            )}
          >
            Cancel
          </button>
          <button
            type='button'
            data-testid='destructive-confirm-accept'
            onClick={onConfirm}
            className={cn(
              'inline-flex h-10 items-center rounded-[var(--gui-radius,12px)] bg-[var(--gui-danger,#f31a1a)] px-4 font-medium text-white',
              'hover:bg-[var(--gui-danger-hover,#c21515)] focus-visible:outline-2 focus-visible:outline-[var(--gui-brand,#1a73e8)] focus-visible:outline-offset-2'
            )}
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  )
}

interface ActionRefreshButtonProps {
  onRefresh: () => void
}

/**
 * Host refresh for a page that has already attempted onLoad. Does not blank
 * bound regions; SpecRenderer keeps existing data while pending.
 */
export function ActionRefreshButton({ onRefresh }: ActionRefreshButtonProps) {
  return (
    <div className='flex justify-end px-6 py-2'>
      <button
        type='button'
        data-testid='action-refresh'
        onClick={onRefresh}
        className='rounded-[var(--gui-radius,12px)] px-3 py-1 font-medium text-[var(--gui-text,#2c2d33)] text-sm hover:bg-[var(--gui-canvas,#f7f8f9)] focus-visible:outline-2 focus-visible:outline-[var(--gui-brand,#1a73e8)] focus-visible:outline-offset-2'
      >
        Refresh
      </button>
    </div>
  )
}

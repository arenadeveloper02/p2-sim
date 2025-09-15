import * as React from 'react'
import { toast as sonnerToast } from 'sonner'
import { cn } from '@/lib/utils'

export interface ToastProps {
  title?: string
  description?: string
  variant?: 'default' | 'destructive' | 'success' | 'warning'
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
  className?: string
}

export interface ToastActionElement extends React.ReactElement {}

const Toast = React.forwardRef<HTMLDivElement, ToastProps>(
  ({ className, title, description, variant = 'default', action, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'group pointer-events-auto relative flex w-80 items-center justify-between space-x-4 overflow-hidden rounded-md p-6 pr-8 shadow-lg transition-all',
          {
            'border border-border bg-background text-foreground': variant === 'default',
            'bg-red-600 text-white': variant === 'destructive',
            'bg-emerald-600 text-white': variant === 'success',
            'bg-amber-600 text-white': variant === 'warning',
          },
          className
        )}
        style={{
          background:
            variant === 'success'
              ? 'linear-gradient(135deg, #059669 0%, #047857 100%)'
              : variant === 'destructive'
                ? 'linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)'
                : variant === 'warning'
                  ? 'linear-gradient(135deg, #d97706 0%, #b45309 100%)'
                  : variant === 'default'
                    ? undefined
                    : undefined,
          color:
            variant === 'success'
              ? 'white'
              : variant === 'destructive'
                ? 'white'
                : variant === 'warning'
                  ? 'white'
                  : variant === 'default'
                    ? undefined
                    : undefined,
          boxShadow:
            variant === 'success'
              ? '0 10px 25px -5px rgba(5, 150, 105, 0.3), 0 4px 6px -2px rgba(5, 150, 105, 0.1)'
              : variant === 'destructive'
                ? '0 10px 25px -5px rgba(220, 38, 38, 0.3), 0 4px 6px -2px rgba(220, 38, 38, 0.1)'
                : variant === 'warning'
                  ? '0 10px 25px -5px rgba(217, 119, 6, 0.3), 0 4px 6px -2px rgba(217, 119, 6, 0.1)'
                  : undefined,
        }}
        {...props}
      >
        <div className='grid gap-1'>
          {title && <div className='font-semibold text-sm [&+div]:text-xs'>{title}</div>}
          {description && <div className='text-sm opacity-90'>{description}</div>}
        </div>
        {action && (
          <div className='flex items-center space-x-2'>
            <button
              onClick={action.onClick}
              className='inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 font-medium text-xs ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'
            >
              {action.label}
            </button>
          </div>
        )}
      </div>
    )
  }
)
Toast.displayName = 'Toast'

// Toast action component
const ToastAction = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'inline-flex h-8 shrink-0 items-center justify-center rounded-md border bg-transparent px-3 font-medium text-xs ring-offset-background transition-colors hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
      className
    )}
    {...props}
  />
))
ToastAction.displayName = 'ToastAction'

// Toast close component
const ToastClose = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement>
>(({ className, ...props }, ref) => (
  <button
    ref={ref}
    className={cn(
      'absolute top-2 right-2 rounded-md p-1 text-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none focus:ring-2 group-hover:opacity-100',
      className
    )}
    {...props}
  >
    <svg
      className='h-4 w-4'
      fill='none'
      stroke='currentColor'
      viewBox='0 0 24 24'
      xmlns='http://www.w3.org/2000/svg'
    >
      <path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M6 18L18 6M6 6l12 12' />
    </svg>
  </button>
))
ToastClose.displayName = 'ToastClose'

// Toast description component
const ToastDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm opacity-90', className)} {...props} />
  )
)
ToastDescription.displayName = 'ToastDescription'

// Toast title component
const ToastTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('font-semibold text-sm', className)} {...props} />
  )
)
ToastTitle.displayName = 'ToastTitle'

// Toast viewport component
const ToastViewport = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:top-auto sm:right-0 sm:bottom-0 sm:flex-col md:max-w-[320px]',
        className
      )}
      {...props}
    />
  )
)
ToastViewport.displayName = 'ToastViewport'

// Toast functions using Sonner
const toast = (props: ToastProps | string) => {
  if (typeof props === 'string') {
    return sonnerToast(props)
  }

  const { title, description, variant, duration, action, ...rest } = props

  return sonnerToast(
    <Toast title={title} description={description} variant={variant} action={action} {...rest} />,
    {
      duration,
    }
  )
}

const toastSuccess = (message: string, options?: Omit<ToastProps, 'variant'>) => {
  return toast({ ...options, title: message, variant: 'success' })
}

const toastError = (message: string, options?: Omit<ToastProps, 'variant'>) => {
  return toast({ ...options, title: message, variant: 'destructive' })
}

const toastWarning = (message: string, options?: Omit<ToastProps, 'variant'>) => {
  return toast({ ...options, title: message, variant: 'warning' })
}

const toastInfo = (message: string, options?: Omit<ToastProps, 'variant'>) => {
  return toast({ ...options, title: message, variant: 'default' })
}

export {
  Toast,
  ToastAction,
  ToastClose,
  ToastDescription,
  ToastTitle,
  ToastViewport,
  toast,
  toastSuccess,
  toastError,
  toastWarning,
  toastInfo,
}

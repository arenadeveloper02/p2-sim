'use client'

import { Toaster as SonnerToaster } from 'sonner'
import { cn } from '@/lib/utils'

interface ToasterProps {
  className?: string
  position?:
    | 'top-left'
    | 'top-center'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-center'
    | 'bottom-right'
  richColors?: boolean
  expand?: boolean
  duration?: number
  closeButton?: boolean
  toastOptions?: {
    classNames?: {
      toast?: string
      description?: string
      actionButton?: string
      cancelButton?: string
      closeButton?: string
      error?: string
      success?: string
      warning?: string
      info?: string
    }
  }
}

const Toaster = ({
  className,
  position = 'bottom-right',
  richColors = false,
  expand = true,
  duration = 3000,
  closeButton = true,
  toastOptions,
  ...props
}: ToasterProps) => {
  return (
    <SonnerToaster
      className={cn('toaster group', className)}
      position={position}
      richColors={richColors}
      expand={expand}
      duration={duration}
      closeButton={closeButton}
      toastOptions={{
        classNames: {
          toast: '!bg-transparent !border-0 !shadow-none !p-0 !m-0 !w-80',
          description: '!text-current !opacity-90',
          actionButton: '!bg-white/20 !text-current hover:!bg-white/30 !border-0',
          cancelButton: '!bg-white/20 !text-current hover:!bg-white/30 !border-0',
          closeButton: '!text-current/70 hover:!text-current',
          error: '!bg-red-600 !text-white !border-0 !shadow-lg',
          success: '!bg-emerald-600 !text-white !border-0 !shadow-lg',
          warning: '!bg-amber-600 !text-white !border-0 !shadow-lg',
          info: '!bg-blue-600 !text-white !border-0 !shadow-lg',
          ...toastOptions?.classNames,
        },
        ...toastOptions,
      }}
      {...props}
    />
  )
}

export { Toaster }

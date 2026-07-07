'use client'

import Image from 'next/image'
import { Download, Menu, MoreHorizontal, PanelLeftOpen, Share2 } from 'lucide-react'
import { inter } from '@/app/_styles/fonts/inter/inter'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/emcn'
import { cn } from '@/lib/core/utils/cn'

interface ArenaChatHeaderProps {
  chatConfig: {
    title?: string
    description?: string
    customizations?: {
      headerText?: string
    }
  } | null
  showFeedbackView?: boolean
  isSidebarCollapsed?: boolean
  onToggleSidebar?: () => void
  onExportChat?: () => void
  onShareChat?: () => void
  onShowKeyboardShortcuts?: () => void
}

export function ArenaChatHeader({
  chatConfig,
  showFeedbackView = false,
  isSidebarCollapsed = false,
  onToggleSidebar,
  onExportChat,
  onShareChat,
  onShowKeyboardShortcuts,
}: ArenaChatHeaderProps) {
  const title = showFeedbackView
    ? 'User Feedback'
    : chatConfig?.customizations?.headerText || chatConfig?.title || 'Chat'
  const description = showFeedbackView ? undefined : chatConfig?.description
  const showOverflowMenu =
    !showFeedbackView && (onExportChat || onShareChat || onShowKeyboardShortcuts)

  return (
    <nav
      aria-label='Chat navigation'
      className='grid h-12 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 border-[var(--border-1)] border-b px-4'
    >
      <div className='flex items-center'>
        {onToggleSidebar && (
          <>
            <button
              type='button'
              onClick={onToggleSidebar}
              className='flex size-8 items-center justify-center rounded-md text-[var(--text-icon)] hover:bg-[var(--surface-2)] md:hidden'
              aria-label='Open sidebar'
            >
              <Menu className='size-[14px]' />
            </button>
            {isSidebarCollapsed && (
              <button
                type='button'
                onClick={onToggleSidebar}
                className='hidden size-8 items-center justify-center rounded-md text-[var(--text-icon)] hover:bg-[var(--surface-2)] md:flex'
                aria-label='Open sidebar'
              >
                <PanelLeftOpen className='size-[14px]' />
              </button>
            )}
          </>
        )}
      </div>

      <div className='min-w-0 px-2 text-center'>
        <h2
          className={cn(inter.className, 'truncate font-semibold text-[var(--text-body)] text-lg')}
        >
          {title}
        </h2>
        {description && (
          <p className='hidden truncate text-[var(--text-muted)] text-sm sm:block'>{description}</p>
        )}
      </div>

      <div className='flex items-center justify-end'>
        {showOverflowMenu && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type='button'
                className='flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--text-icon)] hover:bg-[var(--surface-2)]'
                aria-label='Chat options'
              >
                <MoreHorizontal className='size-[14px]' />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end'>
              {onShareChat && (
                <DropdownMenuItem onClick={onShareChat}>
                  <Share2 className='size-[14px]' />
                  Copy link
                </DropdownMenuItem>
              )}
              {onExportChat && (
                <DropdownMenuItem onClick={onExportChat}>
                  <Download className='size-[14px]' />
                  Export chat
                </DropdownMenuItem>
              )}
              {onShowKeyboardShortcuts && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onShowKeyboardShortcuts}>
                    Keyboard shortcuts
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </nav>
  )
}

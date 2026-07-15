'use client'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@sim/emcn'
import { Download, Menu, MoreHorizontal, Share2 } from 'lucide-react'
import {
  DEPLOYED_CHAT_CANVAS_BG,
  DEPLOYED_CHAT_DIVIDER,
  DEPLOYED_CHAT_TEXT_DISPLAY,
} from '@/app/(interfaces)/chat/constants'

interface ArenaChatHeaderProps {
  chatConfig?: {
    title?: string
    description?: string
    customizations?: {
      headerText?: string
    }
  } | null
  showFeedbackView?: boolean
  hideCenterTitle?: boolean
  onToggleSidebar?: () => void
  onExportChat?: () => void
  onShareChat?: () => void
  onShowKeyboardShortcuts?: () => void
}

export function ArenaChatHeader({
  chatConfig,
  showFeedbackView = false,
  hideCenterTitle = false,
  onToggleSidebar,
  onExportChat,
  onShareChat,
  onShowKeyboardShortcuts,
}: ArenaChatHeaderProps) {
  const title = showFeedbackView
    ? 'User Feedback'
    : chatConfig?.customizations?.headerText || chatConfig?.title || 'Chat'
  const showOverflowMenu =
    !showFeedbackView && (onExportChat || onShareChat || onShowKeyboardShortcuts)

  return (
    <nav
      aria-label='Chat navigation'
      className='grid h-12 shrink-0 grid-cols-[auto_1fr_auto] items-center gap-2 border-b px-4'
      style={{
        backgroundColor: DEPLOYED_CHAT_CANVAS_BG,
        borderColor: DEPLOYED_CHAT_DIVIDER,
      }}
    >
      <div className='flex items-center'>
        {onToggleSidebar && (
          <button
            type='button'
            onClick={onToggleSidebar}
            className='flex size-8 items-center justify-center rounded-md text-[var(--text-icon)] hover:bg-[var(--surface-2)] md:hidden'
            aria-label='Open sidebar'
          >
            <Menu className='size-[14px]' />
          </button>
        )}
      </div>

      <div className='min-w-0 px-2 text-center'>
        {!hideCenterTitle && (
          <h2
            className='truncate font-semibold text-[17px] md:text-lg'
            style={{ color: DEPLOYED_CHAT_TEXT_DISPLAY }}
          >
            {title}
          </h2>
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

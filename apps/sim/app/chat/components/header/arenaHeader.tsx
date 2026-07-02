'use client'

import Image from 'next/image'
import { Download, Menu, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Share2 } from 'lucide-react'
import { inter } from '@/app/_styles/fonts/inter/inter'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/emcn'
import { cn } from '@/lib/core/utils/cn'
import { useBrandConfig } from '@/ee/whitelabeling/branding'

const ARENA_LOGO_URL =
  'https://arenav2image.s3.us-west-1.amazonaws.com/rt/calibrate/Arena_Logo_WebDashboard.svg'

interface ArenaChatHeaderProps {
  chatConfig: {
    title?: string
    description?: string
    customizations?: {
      headerText?: string
      logoUrl?: string
      imageUrl?: string
      primaryColor?: string
    }
  } | null
  showFeedbackView?: boolean
  isSidebarCollapsed?: boolean
  isMobileSidebarOpen?: boolean
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
  const brand = useBrandConfig()
  const logoUrl =
    chatConfig?.customizations?.logoUrl ||
    chatConfig?.customizations?.imageUrl ||
    brand.logoUrl ||
    ARENA_LOGO_URL
  const title = showFeedbackView
    ? 'User Feedback'
    : chatConfig?.customizations?.headerText || chatConfig?.title || 'Chat'
  const description = showFeedbackView ? undefined : chatConfig?.description

  return (
    <nav
      aria-label='Chat navigation'
      className='flex w-full items-center justify-between gap-3 border-[var(--border-1)] border-b px-4 py-2'
    >
      <div className='flex min-w-0 flex-1 items-center gap-3'>
        {onToggleSidebar && (
          <button
            type='button'
            onClick={onToggleSidebar}
            className='flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--text-icon)] hover:bg-[var(--surface-2)]'
            aria-label={isSidebarCollapsed ? 'Open sidebar' : 'Close sidebar'}
          >
            <Menu className='size-[14px] md:hidden' />
            <span className='hidden md:inline'>
              {isSidebarCollapsed ? (
                <PanelLeftOpen className='size-[14px]' />
              ) : (
                <PanelLeftClose className='size-[14px]' />
              )}
            </span>
          </button>
        )}

        <Image src={logoUrl} alt='Logo' width={56} height={56} className='h-9 w-auto shrink-0' />

        <div className='min-w-0'>
          <h2 className={cn(inter.className, 'truncate font-semibold text-[var(--text-body)] text-lg')}>
            {title}
          </h2>
          {description && (
            <p className='hidden truncate text-[var(--text-muted)] text-sm sm:block'>{description}</p>
          )}
        </div>
      </div>

      {!showFeedbackView && (onExportChat || onShareChat || onShowKeyboardShortcuts) && (
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
    </nav>
  )
}

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { formatRelativeTime } from '@sim/utils/formatting'
import {
  ArrowLeft,
  CirclePlus,
  FileText,
  MessageSquareText,
  MoreHorizontal,
  PanelLeftClose,
  Pin,
  PinOff,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import {
  ChipConfirmModal,
  ChipInput,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tooltip,
} from '@/components/emcn'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/core/utils/cn'
import { deployedChatExitEvent } from '@/app/arenaMixpanelEvents/mixpanelEvents'
import { DEPLOYED_CHAT_CANVAS_BG } from '@/app/chat/constants'
import { groupThreadsByDate } from '@/app/chat/utils/thread-date-groups'

export interface ThreadRecord {
  chatId: string
  title: string
  workflowId: string
  createdAt: string
  updatedAt: string
  pinnedAt?: string | null
}

interface LeftNavThreadProps {
  threads: ThreadRecord[]
  isLoading: boolean
  error?: string | null
  currentChatId: string
  onSelectThread?: (chatId: string) => void
  onRefreshThread?: () => void
  onNewChat?: () => void
  onRenameThread?: (chatId: string, title: string) => void
  onDeleteThread?: (chatId: string) => void
  onTogglePinThread?: (chatId: string, pinned: boolean) => void
  isStreaming: boolean
  workflowId?: string
  showReRun?: boolean
  showFeedbackView?: boolean
  onReRun?: () => void
  onViewFeedback?: () => void
  onViewGoldenQueries?: () => void
  isGoldenQueriesOpen?: boolean
  showLandingView?: boolean
  isCollapsed?: boolean
  isMobileOpen?: boolean
  onCloseMobile?: () => void
  searchInputRef?: React.RefObject<HTMLInputElement | null>
  logoUrl?: string
  onToggleSidebar?: () => void
}

type SidebarActionIcon = React.ComponentType<{ className?: string }>

function sidebarRowClass(isActive: boolean, disabled = false) {
  return cn(
    'group flex min-h-8 cursor-pointer items-center gap-1 rounded-lg bg-white px-2 py-1 font-normal transition-colors',
    isActive && 'shadow-sm',
    disabled && 'cursor-not-allowed opacity-50'
  )
}

function sidebarRowIconClass(isActive: boolean) {
  return cn(
    'ml-1 size-4 shrink-0',
    isActive
      ? 'text-[#155CBA]'
      : 'text-[var(--text-body)] group-hover:text-[#155CBA]'
  )
}

function sidebarRowLabelClass(isActive: boolean) {
  return cn(
    'truncate text-sm',
    isActive
      ? 'font-medium text-[#155CBA]'
      : 'font-normal text-[var(--text-body)] group-hover:font-medium group-hover:text-[#155CBA]'
  )
}

interface SidebarActionButtonProps {
  icon: SidebarActionIcon
  label: string
  onClick: () => void
  disabled?: boolean
  collapsed?: boolean
  isActive?: boolean
}

function SidebarActionButton({
  icon: Icon,
  label,
  onClick,
  disabled = false,
  collapsed = false,
  isActive = false,
}: SidebarActionButtonProps) {
  const button = (
    <button
      type='button'
      className={cn(
        sidebarRowClass(isActive, disabled),
        collapsed ? 'size-8 justify-center px-0' : 'w-full'
      )}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={isActive ? 'true' : undefined}
    >
      <Icon className={cn(sidebarRowIconClass(isActive), collapsed && 'ml-0')} />
      {!collapsed && <span className={sidebarRowLabelClass(isActive)}>{label}</span>}
    </button>
  )

  if (!collapsed) return button

  return (
    <Tooltip.Provider>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{button}</Tooltip.Trigger>
        <Tooltip.Content>{label}</Tooltip.Content>
      </Tooltip.Root>
    </Tooltip.Provider>
  )
}

function ThreadSkeleton() {
  return (
    <div className='flex min-h-8 animate-pulse items-center gap-2 rounded-lg bg-white px-2 py-1'>
      <div className='size-4 rounded bg-[var(--surface-3)]' />
      <div className='h-3 flex-1 rounded bg-[var(--surface-3)]' />
    </div>
  )
}

interface ThreadRowProps {
  thread: ThreadRecord
  isActive: boolean
  isRenaming: boolean
  renameValue: string
  isStreaming: boolean
  onSelect: () => void
  onRefresh: () => void
  onStartRename: () => void
  onRenameChange: (value: string) => void
  onRenameSave: () => void
  onRenameCancel: () => void
  onDelete: () => void
  onTogglePin: () => void
}

function ThreadRow({
  thread,
  isActive,
  isRenaming,
  renameValue,
  isStreaming,
  onSelect,
  onRefresh,
  onStartRename,
  onRenameChange,
  onRenameSave,
  onRenameCancel,
  onDelete,
  onTogglePin,
}: ThreadRowProps) {
  const renameInputRef = useRef<HTMLInputElement>(null)
  const isPinned = Boolean(thread.pinnedAt)

  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [isRenaming])

  if (isRenaming) {
    return (
      <div className='flex min-h-8 items-center gap-1 rounded-lg bg-white px-2 py-1'>
        <ChipInput
          ref={renameInputRef}
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onRenameSave()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              onRenameCancel()
            }
          }}
          onBlur={onRenameSave}
          autoFocus
          className='h-7 min-w-0 flex-1'
        />
      </div>
    )
  }

  return (
    <div
      className={sidebarRowClass(isActive)}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      role='button'
      tabIndex={0}
      aria-label={`Open chat: ${thread.title || 'Untitled chat'}`}
      aria-current={isActive ? 'true' : undefined}
    >
      <MessageSquareText className={sidebarRowIconClass(isActive)} />

      <div className='min-w-0 flex-1'>
        <Tooltip.Provider>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <div className={sidebarRowLabelClass(isActive)}>
                {thread.title || 'Untitled chat'}
              </div>
            </Tooltip.Trigger>
            {thread.title?.length > 23 && (
              <Tooltip.Content>
                {thread.title}
                <br />
                {formatRelativeTime(thread.updatedAt)}
              </Tooltip.Content>
            )}
          </Tooltip.Root>
        </Tooltip.Provider>
      </div>

      {isPinned && (
        <Pin className='size-3 shrink-0 text-[var(--text-icon)]' aria-label='Pinned' />
      )}

      <div
        className={cn(
          'flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100',
          isActive && 'opacity-100'
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {isActive && (
          <button
            type='button'
            className='flex size-6 items-center justify-center rounded text-[var(--text-icon)] hover:bg-[var(--surface-3)]'
            onClick={onRefresh}
            disabled={isStreaming}
            aria-label='Refresh conversation'
          >
            <RefreshCw className='size-3.5' />
          </button>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type='button'
              className='flex size-6 items-center justify-center rounded text-[var(--text-icon)] hover:bg-[var(--surface-3)]'
              aria-label='Thread options'
              disabled={isStreaming}
            >
              <MoreHorizontal className='size-3.5' />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start' side='right'>
            <DropdownMenuItem onClick={onStartRename}>Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={onTogglePin}>
              {isPinned ? (
                <>
                  <PinOff className='size-[14px]' />
                  Unpin
                </>
              ) : (
                <>
                  <Pin className='size-[14px]' />
                  Pin
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDelete} className='text-red-600'>
              <Trash2 className='size-[14px]' />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

const LeftNavThread = ({
  threads,
  isLoading,
  error,
  currentChatId,
  onSelectThread,
  onRefreshThread,
  onNewChat,
  onRenameThread,
  onDeleteThread,
  onTogglePinThread,
  isStreaming,
  workflowId,
  showReRun = false,
  showFeedbackView = false,
  onReRun,
  onViewFeedback,
  onViewGoldenQueries,
  isGoldenQueriesOpen = false,
  showLandingView = false,
  isCollapsed = false,
  isMobileOpen = false,
  onCloseMobile,
  searchInputRef,
  logoUrl,
  onToggleSidebar,
}: LeftNavThreadProps) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<ThreadRecord | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const internalSearchRef = useRef<HTMLInputElement>(null)
  const resolvedSearchRef = searchInputRef ?? internalSearchRef

  const params = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : ''
  )
  const workspaceId = params.get('workspaceId')
  const isFromControlBar = params.get('fromControlBar') === 'true'

  const getExitUrl = () => {
    if (isFromControlBar && workspaceId && workflowId) {
      return `/workspace/${workspaceId}/w/${workflowId}`
    }
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname
      if (hostname.includes('localhost')) return 'http://localhost:3001/hub/agents'
      if (hostname.includes('dev-agent')) return 'https://dev.thearena.ai/hub/agents'
      if (hostname.includes('test-agent')) return 'https://test.thearena.ai/hub/agents'
      return 'https://app.thearena.ai/hub/agents'
    }
    return '/'
  }

  const filteredThreads = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) return threads
    return threads.filter((t) => t.title?.toLowerCase().includes(query))
  }, [threads, searchQuery])

  const groupedThreads = useMemo(() => groupThreadsByDate(filteredThreads), [filteredThreads])

  const handleStartRename = useCallback((thread: ThreadRecord) => {
    setRenamingChatId(thread.chatId)
    setRenameValue(thread.title)
  }, [])

  const handleRenameSave = useCallback(() => {
    if (!renamingChatId) return
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== threads.find((t) => t.chatId === renamingChatId)?.title) {
      onRenameThread?.(renamingChatId, trimmed)
    }
    setRenamingChatId(null)
    setRenameValue('')
  }, [renamingChatId, renameValue, threads, onRenameThread])

  const handleRenameCancel = useCallback(() => {
    setRenamingChatId(null)
    setRenameValue('')
  }, [])

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      await onDeleteThread?.(deleteTarget.chatId)
    } finally {
      setIsDeleting(false)
      setDeleteTarget(null)
    }
  }, [deleteTarget, onDeleteThread])

  const handleSelectThread = useCallback(
    (chatId: string) => {
      onSelectThread?.(chatId)
      onCloseMobile?.()
    },
    [onSelectThread, onCloseMobile]
  )

  const actionButtonsDisabled = isLoading || isStreaming
  const isNewChatActive = showLandingView && !showFeedbackView && !isGoldenQueriesOpen

  const primaryActionButtons = (collapsed: boolean) => (
    <div className={cn('flex flex-col gap-2', collapsed && 'items-center')}>
      {showReRun && onReRun && !collapsed && (
        <button
          type='button'
          className={cn(sidebarRowClass(false, actionButtonsDisabled), 'w-full')}
          onClick={onReRun}
          disabled={actionButtonsDisabled}
          title='Re-run workflow with new input values'
        >
          <RefreshCw className={sidebarRowIconClass(false)} />
          <span className={sidebarRowLabelClass(false)}>Re-Run</span>
        </button>
      )}
      <SidebarActionButton
        collapsed={collapsed}
        icon={CirclePlus}
        label='New Chat'
        onClick={() => onNewChat?.()}
        disabled={actionButtonsDisabled}
        isActive={isNewChatActive}
      />
      <SidebarActionButton
        collapsed={collapsed}
        icon={Sparkles}
        label='Golden Queries'
        onClick={() => onViewGoldenQueries?.()}
        disabled={actionButtonsDisabled}
        isActive={isGoldenQueriesOpen}
      />
      <SidebarActionButton
        collapsed={collapsed}
        icon={FileText}
        label='View Feedback'
        onClick={() => onViewFeedback?.()}
        disabled={actionButtonsDisabled}
        isActive={showFeedbackView}
      />
    </div>
  )

  if (isCollapsed && !isMobileOpen) {
    return (
      <div
        className='flex h-full w-12 shrink-0 flex-col items-center border-[var(--border-1)] border-r px-1 py-4'
        style={{ backgroundColor: DEPLOYED_CHAT_CANVAS_BG }}
      >
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt='Logo'
            width={40}
            height={40}
            className='mb-3 h-7 w-auto shrink-0'
          />
        ) : null}
        {primaryActionButtons(true)}
        <hr className='my-4 w-full border-[var(--border-1)]' />
      </div>
    )
  }

  const sidebarContent = (
    <div
      className={cn(
        'flex h-full w-[280px] shrink-0 flex-col border-[var(--border-1)] border-r px-2 py-4',
        isMobileOpen && 'shadow-xl'
      )}
      style={{ backgroundColor: DEPLOYED_CHAT_CANVAS_BG }}
    >
      <div className='mb-4 flex items-center justify-between px-1'>
        {logoUrl ? (
          <Image src={logoUrl} alt='Logo' width={56} height={56} className='h-8 w-auto shrink-0' />
        ) : (
          <div className='size-8' />
        )}
        {onToggleSidebar && (
          <button
            type='button'
            onClick={onToggleSidebar}
            className='flex size-8 items-center justify-center rounded-md text-[var(--text-icon)] hover:bg-[var(--surface-3)]'
            aria-label='Close sidebar'
          >
            <PanelLeftClose className='size-[14px]' />
          </button>
        )}
      </div>

      {primaryActionButtons(false)}

      <hr className='my-4 border-[var(--border-1)]' />

      <div>
        <ChipInput
          ref={resolvedSearchRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder='Search chats...'
          icon={Search}
          className='h-8 rounded-lg border-none bg-white shadow-sm'
          aria-label='Search chats'
        />
      </div>

      <hr className='my-4 border-[var(--border-1)]' />

      <p className='mb-2 px-1 font-medium text-[var(--text-muted)] text-xs uppercase tracking-wide'>
        Chats
      </p>

      <div className='flex-1 overflow-y-auto'>
        {isLoading ? (
          <div className='flex flex-col gap-2'>
            {Array.from({ length: 5 }).map((_, i) => (
              <ThreadSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className='flex items-center justify-center py-8'>
            <div className='text-red-500 text-sm'>Failed to load threads</div>
          </div>
        ) : groupedThreads.length > 0 ? (
          <div className='flex flex-col gap-3'>
            {groupedThreads.map((group) => (
              <div key={group.label} className='flex flex-col gap-2'>
                <p className='px-1 text-[var(--text-muted)] text-xs'>{group.label}</p>
                {group.threads.map((thread) => (
                  <ThreadRow
                    key={thread.chatId}
                    thread={thread}
                    isActive={
                      currentChatId === thread.chatId &&
                      !showFeedbackView &&
                      !isGoldenQueriesOpen
                    }
                    isRenaming={renamingChatId === thread.chatId}
                    renameValue={renameValue}
                    isStreaming={isStreaming}
                    onSelect={() => handleSelectThread(thread.chatId)}
                    onRefresh={() => onRefreshThread?.()}
                    onStartRename={() => handleStartRename(thread)}
                    onRenameChange={setRenameValue}
                    onRenameSave={handleRenameSave}
                    onRenameCancel={handleRenameCancel}
                    onDelete={() => setDeleteTarget(thread)}
                    onTogglePin={() =>
                      onTogglePinThread?.(thread.chatId, !thread.pinnedAt)
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className='flex flex-col items-center justify-center gap-2 py-8 text-center'>
            <p className='text-[var(--text-muted)] text-sm'>
              {searchQuery ? 'No matching conversations' : 'No conversations yet'}
            </p>
            {!searchQuery && (
              <button
                type='button'
                className='text-[var(--brand-primary-hex)] text-sm hover:underline'
                onClick={() => onNewChat?.()}
                disabled={isStreaming}
              >
                Start a new chat
              </button>
            )}
          </div>
        )}
      </div>

      <hr className='my-4 border-[var(--border-1)]' />

      <div className='flex items-center gap-3'>
        <Button
          variant='outline'
          className='flex size-8 items-center justify-center border-[var(--border-1)] bg-[var(--surface-1)] hover:shadow-md'
          onClick={() => {
            deployedChatExitEvent({})
            window.location.replace(getExitUrl())
          }}
          aria-label='Exit agent'
        >
          <ArrowLeft className='size-4 text-[var(--text-icon)]' />
        </Button>
        <span className='font-normal text-[var(--text-body)] text-sm'>Exit Agent</span>
      </div>

      <ChipConfirmModal
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
        title='Delete chat'
        text={[
          'Delete ',
          { text: deleteTarget?.title ?? 'this chat', bold: true },
          '? This cannot be undone.',
        ]}
        confirm={{
          label: 'Delete',
          onClick: handleConfirmDelete,
          pending: isDeleting,
          pendingLabel: 'Deleting...',
        }}
      />
    </div>
  )

  if (isMobileOpen) {
    return (
      <>
        <button
          type='button'
          className='fixed inset-0 z-40 bg-black/40 md:hidden'
          onClick={onCloseMobile}
          aria-label='Close sidebar'
        />
        <div className='fixed inset-y-0 left-0 z-50 md:hidden'>
          <div className='flex h-full items-start justify-between'>
            {sidebarContent}
            <button
              type='button'
              className='m-2 flex size-8 items-center justify-center rounded-full bg-[var(--surface-1)] shadow'
              onClick={onCloseMobile}
              aria-label='Close sidebar'
            >
              <X className='size-4' />
            </button>
          </div>
        </div>
      </>
    )
  }

  return sidebarContent
}

export default LeftNavThread

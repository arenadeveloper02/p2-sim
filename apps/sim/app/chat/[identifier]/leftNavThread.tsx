'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { formatRelativeTime } from '@sim/utils/formatting'
import {
  ArrowLeft,
  CirclePlus,
  Ellipsis,
  FileText,
  MessageSquareText,
  MoreHorizontal,
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
  isCollapsed?: boolean
  isMobileOpen?: boolean
  onCloseMobile?: () => void
  searchInputRef?: React.RefObject<HTMLInputElement | null>
}

function ThreadSkeleton() {
  return (
    <div className='flex h-8 animate-pulse items-center gap-2 rounded bg-[var(--surface-1)] px-2'>
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
      <div className='flex h-8 items-center gap-1 rounded bg-[var(--surface-1)] px-1'>
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
      className={cn(
        'group flex h-8 cursor-pointer items-center gap-1 rounded px-1 transition-colors',
        isActive
          ? 'bg-[var(--surface-1)] font-semibold shadow-sm'
          : 'bg-transparent hover:bg-[var(--surface-1)]'
      )}
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
      <MessageSquareText
        className={cn(
          'ml-1 size-4 shrink-0',
          isActive ? 'text-[var(--brand-primary-hex)]' : 'text-[var(--text-icon)]'
        )}
      />

      <div className='min-w-0 flex-1'>
        <Tooltip.Provider>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <div className='truncate text-[var(--text-body)] text-sm'>
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
  isCollapsed = false,
  isMobileOpen = false,
  onCloseMobile,
  searchInputRef,
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

  if (isCollapsed && !isMobileOpen) {
    return null
  }

  const sidebarContent = (
    <div
      className={cn(
        'flex h-full w-[280px] shrink-0 flex-col border-[var(--border-1)] border-r bg-[var(--surface-2)] px-2 py-4',
        isMobileOpen && 'shadow-xl'
      )}
    >
      <div className='flex flex-col gap-2'>
        {showReRun && onReRun && (
          <Button
            className='h-8 w-full justify-start gap-2 rounded border-none bg-[var(--surface-1)] font-normal text-[var(--text-body)] text-sm hover:bg-[var(--surface-1)] hover:shadow-md'
            variant='outline'
            onClick={onReRun}
            disabled={isLoading || isStreaming}
            title='Re-run workflow with new input values'
          >
            <RefreshCw className='size-4 text-[var(--text-icon)]' />
            Re-Run
          </Button>
        )}
        <Button
          className='h-8 w-full justify-start gap-2 rounded border-none bg-[var(--surface-1)] font-normal text-[var(--text-body)] text-sm hover:bg-[var(--surface-1)] hover:shadow-md'
          variant='outline'
          onClick={() => onNewChat?.()}
          disabled={isLoading || isStreaming}
        >
          <CirclePlus className='size-4 text-[var(--text-icon)]' />
          New Chat
        </Button>
      </div>

      <div className='mt-4'>
        <ChipInput
          ref={resolvedSearchRef}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder='Search chats...'
          icon={Search}
          className='h-8'
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
              <div key={group.label} className='flex flex-col gap-1'>
                <p className='px-1 text-[var(--text-muted)] text-xs'>{group.label}</p>
                {group.threads.map((thread) => (
                  <ThreadRow
                    key={thread.chatId}
                    thread={thread}
                    isActive={currentChatId === thread.chatId}
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

      <div className='mt-2'>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              className='h-8 w-full justify-start gap-2 rounded border-none bg-[var(--surface-1)] font-normal text-[var(--text-body)] text-sm hover:shadow-md'
              variant='outline'
              disabled={isLoading || isStreaming}
            >
              <Ellipsis className='size-4 text-[var(--text-icon)]' />
              More tools
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align='start' side='top' className='w-56'>
            <DropdownMenuItem
              onClick={() => onViewGoldenQueries?.()}
              disabled={showFeedbackView || isStreaming}
            >
              <Sparkles className='size-[14px]' />
              Golden queries
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onViewFeedback?.()} disabled={isStreaming}>
              <FileText className='size-[14px]' />
              View Feedback
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PanelLeft } from '@/components/emcn/icons'
import { useSession } from '@/lib/auth/auth-client'
import { MothershipChat, MothershipView } from '@/app/workspace/[workspaceId]/home/components'
import {
  getMothershipUseChatOptions,
  useChat,
  useMothershipResize,
} from '@/app/workspace/[workspaceId]/home/hooks'
import type {
  FileAttachmentForApi,
  MothershipResource,
  MothershipResourceType,
} from '@/app/workspace/[workspaceId]/home/types'
import { useMarkTaskRead, useTasks } from '@/hooks/queries/tasks'
import type { ChatContext } from '@/stores/panel'

interface CopilotReplicaPageProps {
  workspaceId: string
}

/**
 * Standalone Copilot replica: same chat stack as Home (`useChat` + `MothershipChat` + `MothershipView`)
 * so Options, tools, markdown, and resources match production behavior.
 */
export function CopilotReplicaPage({ workspaceId }: CopilotReplicaPageProps) {
  const { data: session } = useSession()
  const { mutate: markRead } = useMarkTaskRead(workspaceId)
  const { data: tasks = [], isLoading: isLoadingTasks } = useTasks(workspaceId)

  const sortedTasks = useMemo(
    () => [...tasks].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
    [tasks]
  )

  const skipAutoSelectFirstRef = useRef(false)
  const [selectedChatId, setSelectedChatId] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (skipAutoSelectFirstRef.current) return
    if (isLoadingTasks || sortedTasks.length === 0) return
    setSelectedChatId((prev) => prev ?? sortedTasks[0]!.id)
  }, [isLoadingTasks, sortedTasks])

  const [isResourceCollapsed, setIsResourceCollapsed] = useState(true)
  const [skipResourceTransition, setSkipResourceTransition] = useState(false)
  const isResourceCollapsedRef = useRef(isResourceCollapsed)
  isResourceCollapsedRef.current = isResourceCollapsed

  const { mothershipRef, handleResizePointerDown, clearWidth } = useMothershipResize()

  const collapseResource = useCallback(() => {
    clearWidth()
    setIsResourceCollapsed(true)
  }, [clearWidth])

  const expandResource = useCallback(() => {
    setIsResourceCollapsed(false)
  }, [])

  const handleResourceEvent = useCallback(() => {
    if (isResourceCollapsedRef.current) {
      setIsResourceCollapsed(false)
    }
  }, [])

  const {
    messages,
    isSending,
    isReconnecting,
    sendMessage,
    stopGeneration,
    resolvedChatId,
    resources,
    activeResourceId,
    setActiveResourceId,
    addResource,
    removeResource,
    reorderResources,
    messageQueue,
    removeFromQueue,
    sendNow,
    editQueuedMessage,
    streamingFile,
    genericResourceData,
  } = useChat(
    workspaceId,
    selectedChatId,
    getMothershipUseChatOptions({ onResourceEvent: handleResourceEvent })
  )

  const [editingInputValue, setEditingInputValue] = useState('')
  const clearEditingValue = useCallback(() => setEditingInputValue(''), [])

  useEffect(() => {
    setEditingInputValue('')
  }, [selectedChatId])

  useEffect(() => {
    if (resolvedChatId) markRead(resolvedChatId)
  }, [resolvedChatId, markRead])

  useEffect(() => {
    if (!(resources.length > 0 && isResourceCollapsedRef.current)) return
    setIsResourceCollapsed(false)
    setSkipResourceTransition(true)
    const id = requestAnimationFrame(() => setSkipResourceTransition(false))
    return () => cancelAnimationFrame(id)
  }, [resources])

  const handleSubmit = useCallback(
    (text: string, fileAttachments?: FileAttachmentForApi[], contexts?: ChatContext[]) => {
      const trimmed = text.trim()
      if (!trimmed && !(fileAttachments && fileAttachments.length > 0)) return
      sendMessage(trimmed || 'Analyze the attached file(s).', fileAttachments, contexts)
    },
    [sendMessage]
  )

  const handleContextAdd = useCallback(
    (context: ChatContext) => {
      let resourceType: MothershipResourceType | null = null
      let resourceId: string | null = null
      const resourceTitle: string = context.label

      switch (context.kind) {
        case 'workflow':
        case 'current_workflow':
          resourceType = 'workflow'
          resourceId = context.workflowId
          break
        case 'knowledge':
          if (context.knowledgeId) {
            resourceType = 'knowledgebase'
            resourceId = context.knowledgeId
          }
          break
        case 'table':
          if (context.tableId) {
            resourceType = 'table'
            resourceId = context.tableId
          }
          break
        case 'file':
          if (context.fileId) {
            resourceType = 'file'
            resourceId = context.fileId
          }
          break
        default:
          break
      }

      if (resourceType && resourceId) {
        const resource: MothershipResource = {
          type: resourceType,
          id: resourceId,
          title: resourceTitle,
        }
        addResource(resource)
        handleResourceEvent()
      }
    },
    [addResource, handleResourceEvent]
  )

  const handleEditQueuedMessage = useCallback(
    (id: string) => {
      const msg = editQueuedMessage(id)
      if (msg) {
        setEditingInputValue(msg.content)
      }
    },
    [editQueuedMessage]
  )

  const handleNewChat = useCallback(() => {
    skipAutoSelectFirstRef.current = true
    setSelectedChatId(undefined)
  }, [])

  const handleSelectTask = useCallback((taskId: string) => {
    skipAutoSelectFirstRef.current = false
    setSelectedChatId(taskId)
  }, [])

  return (
    <div className='flex h-[calc(100vh-56px)] min-h-0 bg-[var(--surface-1)]'>
      <aside className='flex w-[300px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface-2)]'>
        <div className='flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-3 py-2'>
          <button
            type='button'
            className='ml-auto shrink-0 rounded-md border border-[var(--border)] bg-[var(--surface-1)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-3)]'
            onClick={handleNewChat}
          >
            New
          </button>
        </div>

        <div className='px-3 py-2 text-sm font-medium text-[var(--text-muted)]'>All tasks</div>

        <div className='max-h-[calc(100vh-140px)] min-h-0 flex-1 overflow-y-auto px-2 pb-3'>
          {isLoadingTasks ? (
            <div className='px-2 py-1 text-sm text-[var(--text-muted)]'>Loading tasks...</div>
          ) : sortedTasks.length === 0 ? (
            <div className='px-2 py-1 text-sm text-[var(--text-muted)]'>No tasks yet.</div>
          ) : (
            sortedTasks.map((task) => (
              <button
                key={task.id}
                type='button'
                className={`mb-1 w-full rounded-md px-2 py-2 text-left text-sm ${
                  selectedChatId === task.id
                    ? 'bg-[var(--surface-4)] text-[var(--text-primary)]'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--surface-3)]'
                }`}
                onClick={() => handleSelectTask(task.id)}
              >
                <div className='truncate'>{task.name}</div>
              </button>
            ))
          )}
        </div>
      </aside>

      <section className='flex min-h-0 min-w-0 flex-1 flex-col'>
        <div className='border-b border-[var(--border)] px-4 py-3'>
          <h1 className='text-base font-semibold'>Copilot</h1>
          <p className='text-xs text-[var(--text-muted)]'>
            Mothership chat UI and stream handling as Home (Options, tools, resources).
          </p>
        </div>

        <div className='relative flex min-h-0 flex-1 bg-[var(--bg)]'>
          <div className='flex h-full min-h-0 min-w-[320px] flex-1 flex-col'>
            <MothershipChat
              messages={messages}
              isSending={isSending}
              isReconnecting={isReconnecting}
              onSubmit={handleSubmit}
              onStopGeneration={stopGeneration}
              messageQueue={messageQueue}
              onRemoveQueuedMessage={removeFromQueue}
              onSendQueuedMessage={sendNow}
              onEditQueuedMessage={handleEditQueuedMessage}
              userId={session?.user?.id}
              onContextAdd={handleContextAdd}
              editValue={editingInputValue}
              onEditValueConsumed={clearEditingValue}
              initialScrollBlocked={resources.length > 0 && isResourceCollapsed}
            />
          </div>

          {!isResourceCollapsed && (
            <div className='relative z-20 w-0 flex-none'>
              <div
                className='absolute inset-y-0 left-[-4px] w-[8px] cursor-ew-resize'
                role='separator'
                aria-orientation='vertical'
                aria-label='Resize resource panel'
                onPointerDown={handleResizePointerDown}
              />
            </div>
          )}

          <MothershipView
            ref={mothershipRef}
            workspaceId={workspaceId}
            chatId={resolvedChatId}
            resources={resources}
            activeResourceId={activeResourceId}
            onSelectResource={setActiveResourceId}
            onAddResource={addResource}
            onRemoveResource={removeResource}
            onReorderResources={reorderResources}
            onCollapse={collapseResource}
            isCollapsed={isResourceCollapsed}
            streamingFile={streamingFile}
            genericResourceData={genericResourceData}
            className={skipResourceTransition ? '!transition-none' : undefined}
          />

          {isResourceCollapsed && (
            <div className='absolute top-[8.5px] right-[16px]'>
              <button
                type='button'
                onClick={expandResource}
                className='flex h-[30px] w-[30px] items-center justify-center rounded-[8px] hover-hover:bg-[var(--surface-active)]'
                aria-label='Expand resource view'
              >
                <PanelLeft className='h-[16px] w-[16px] text-[var(--text-icon)]' />
              </button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

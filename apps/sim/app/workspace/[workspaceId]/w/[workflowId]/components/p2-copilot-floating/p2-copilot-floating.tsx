'use client'

import { type KeyboardEvent, useCallback, useState } from 'react'
import { ArrowUp, Sparkles, Square, Trash2, X } from 'lucide-react'
import { useParams } from 'next/navigation'
import { useShallow } from 'zustand/react/shallow'
import { Button, Input } from '@/components/emcn'
import { cn } from '@/lib/core/utils/cn'
import { useP2CopilotChat } from '@/hooks/use-p2-copilot-chat'
import { useP2CopilotStore } from '@/stores/p2-copilot/store'
import {
  useFloatBoundarySync,
  useFloatDrag,
  useFloatResize,
} from '@/app/workspace/[workspaceId]/w/[workflowId]/hooks/float'
import { useScrollManagement } from '@/app/workspace/[workspaceId]/w/[workflowId]/hooks/use-scroll-management'
import { useWorkflowRegistry } from '@/stores/workflows/registry/store'

function ToolCallRow({
  name,
  status,
}: {
  name: string
  status: 'running' | 'done' | 'error'
}) {
  const label =
    status === 'running' ? 'Running…' : status === 'error' ? 'Failed' : 'Done'
  return (
    <div className='rounded border border-[var(--border-1)] bg-[var(--surface-2)] px-2 py-1 text-[11px] text-[var(--text-secondary)]'>
      <span className='font-medium text-[var(--text-primary)]'>{name}</span>
      <span className='ml-2 text-[var(--text-tertiary)]'>{label}</span>
    </div>
  )
}

/**
 * Floating P2 Copilot panel — separate from mothership/copilot sidebar.
 * Session-only messages (DB persistence comes in Phase 2).
 */
export function P2CopilotFloating() {
  const params = useParams()
  const workspaceId = params.workspaceId as string
  const activeWorkflowId = useWorkflowRegistry((s) => s.activeWorkflowId)

  const {
    isOpen,
    position,
    width,
    height,
    setIsOpen,
    toggleOpen,
    setPosition,
    setDimensions,
  } = useP2CopilotStore(
    useShallow((s) => ({
      isOpen: s.isOpen,
      position: s.position,
      width: s.width,
      height: s.height,
      setIsOpen: s.setIsOpen,
      toggleOpen: s.toggleOpen,
      setPosition: s.setPosition,
      setDimensions: s.setDimensions,
    }))
  )

  const { messages, isSending, error, sendMessage, stopGeneration, clearMessages } =
    useP2CopilotChat({
      workspaceId,
      workflowId: activeWorkflowId ?? undefined,
    })

  const [input, setInput] = useState('')

  const { scrollAreaRef } = useScrollManagement(messages, isSending, { behavior: 'auto' })

  const { handleMouseDown: handleDragStart } = useFloatDrag({
    position,
    width,
    height,
    onPositionChange: setPosition,
  })

  const {
    cursor: resizeCursor,
    handleMouseMove: handleResizeMouseMove,
    handleMouseLeave: handleResizeMouseLeave,
    handleMouseDown: handleResizeMouseDown,
  } = useFloatResize({
    position,
    width,
    height,
    onPositionChange: setPosition,
    onDimensionsChange: setDimensions,
  })

  useFloatBoundarySync({
    isOpen,
    position,
    width,
    height,
    onPositionChange: setPosition,
  })

  const handleSubmit = useCallback(async () => {
    const text = input.trim()
    if (!text) return
    setInput('')
    await sendMessage(text)
  }, [input, sendMessage])

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        void handleSubmit()
      }
    },
    [handleSubmit]
  )

  return (
    <>
      {!isOpen && (
        <Button
          type='button'
          onClick={toggleOpen}
          className='fixed right-6 bottom-20 z-[60] flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border-1)] bg-[var(--surface-5)] p-0 shadow-lg hover:bg-[var(--surface-4)]'
          aria-label='Open P2 Copilot'
          title='P2 Copilot'
        >
          <Sparkles className='h-5 w-5 text-[var(--brand-secondary)]' />
        </Button>
      )}

      {isOpen && (
        <div
          className='fixed z-[60] flex flex-col overflow-hidden rounded-lg border border-[var(--border-1)] bg-[var(--surface-5)] shadow-2xl'
          style={{
            left: `${position.x}px`,
            top: `${position.y}px`,
            width: `${width}px`,
            height: `${height}px`,
            cursor: resizeCursor || undefined,
          }}
          onMouseMove={handleResizeMouseMove}
          onMouseLeave={handleResizeMouseLeave}
          onMouseDown={handleResizeMouseDown}
        >
          <div
            className='flex cursor-grab items-center justify-between border-[var(--border-1)] border-b bg-[var(--surface-4)] px-3 py-2 active:cursor-grabbing'
            onMouseDown={handleDragStart}
          >
            <div className='flex min-w-0 items-center gap-2'>
              <Sparkles className='h-4 w-4 shrink-0 text-[var(--brand-secondary)]' />
              <span className='truncate font-medium text-[var(--text-primary)] text-sm'>
                P2 Copilot
              </span>
            </div>
            <div className='flex items-center gap-1' onMouseDown={(e) => e.stopPropagation()}>
              <Button
                type='button'
                variant='ghost'
                className='h-7 w-7 p-0'
                onClick={clearMessages}
                title='Clear chat'
              >
                <Trash2 className='h-3.5 w-3.5' />
              </Button>
              <Button
                type='button'
                variant='ghost'
                className='h-7 w-7 p-0'
                onClick={() => setIsOpen(false)}
                title='Close'
              >
                <X className='h-4 w-4' />
              </Button>
            </div>
          </div>

          <div ref={scrollAreaRef} className='min-h-0 flex-1 overflow-y-auto px-3 py-3'>
            {messages.length === 0 && (
              <div className='text-[var(--text-tertiary)] text-sm leading-relaxed'>
                Ask about this workflow — blocks, edits, tools, or integrations. P2 Copilot reads
                the canvas and can run Sim tools for you.
              </div>
            )}
            <div className='flex flex-col gap-3'>
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    'rounded-md px-3 py-2 text-sm leading-relaxed',
                    message.role === 'user'
                      ? 'ml-6 bg-[var(--surface-3)] text-[var(--text-primary)]'
                      : 'mr-2 bg-[var(--surface-2)] text-[var(--text-primary)]'
                  )}
                >
                  {message.content ? (
                    <div className='whitespace-pre-wrap break-words'>{message.content}</div>
                  ) : isSending ? (
                    <span className='text-[var(--text-tertiary)]'>Thinking…</span>
                  ) : null}
                  {message.toolCalls && message.toolCalls.length > 0 && (
                    <div className='mt-2 flex flex-col gap-1'>
                      {message.toolCalls.map((tc) => (
                        <ToolCallRow key={tc.id} name={tc.name} status={tc.status} />
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {error && (
              <div className='mt-3 rounded border border-[var(--terminal-status-error-border)] bg-[var(--terminal-status-error-bg)] px-2 py-1.5 text-[var(--text-error)] text-xs'>
                {error}
              </div>
            )}
          </div>

          <div className='flex-none border-[var(--border-1)] border-t p-2'>
            <div className='flex items-center gap-1 rounded-sm border border-[var(--border-1)] bg-[var(--surface-4)] pr-1 pl-2'>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder='Ask P2 Copilot…'
                disabled={isSending}
                className='flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:ring-offset-0'
              />
              {isSending ? (
                <Button
                  type='button'
                  variant='ghost'
                  className='h-8 w-8 shrink-0 p-0'
                  onClick={stopGeneration}
                  title='Stop'
                >
                  <Square className='h-3.5 w-3.5 fill-current' />
                </Button>
              ) : (
                <Button
                  type='button'
                  variant='ghost'
                  className='h-8 w-8 shrink-0 p-0'
                  onClick={() => void handleSubmit()}
                  disabled={!input.trim()}
                  title='Send'
                >
                  <ArrowUp className='h-4 w-4' />
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

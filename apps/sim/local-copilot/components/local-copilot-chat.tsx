'use client'

import { Bug, MessageSquarePlus, Sparkles, Trash2 } from 'lucide-react'
import { Button, Chip, ChipTextarea } from '@/components/emcn'
import { cn } from '@/lib/core/utils/cn'
import { PatchPreview } from '@/local-copilot/components/patch-preview'
import type { LocalCopilotMessage } from '@/local-copilot/hooks/use-local-copilot'

interface LocalCopilotChatProps {
  messages: LocalCopilotMessage[]
  isStreaming: boolean
  input: string
  onInputChange: (value: string) => void
  onSend: () => void
  onClear: () => void
  onDebugLastRun: () => void
  onExplainBlock: () => void
  onGenerateWorkflow: () => void
  selectedBlockId?: string
  pendingPatch?: { patchId: string; patch: LocalCopilotMessage['patch'] } | null
  showDiff: boolean
  onToggleDiff: () => void
  onApplyPatch: () => void
  onRejectPatch: () => void
  isApplying?: boolean
  className?: string
}

export function LocalCopilotChat({
  messages,
  isStreaming,
  input,
  onInputChange,
  onSend,
  onClear,
  onDebugLastRun,
  onExplainBlock,
  onGenerateWorkflow,
  selectedBlockId,
  pendingPatch,
  showDiff,
  onToggleDiff,
  onApplyPatch,
  onRejectPatch,
  isApplying,
  className,
}: LocalCopilotChatProps) {
  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      <div className='flex flex-wrap gap-2 border-b border-[var(--border-subtle)] px-3 py-2'>
        <Chip onClick={onGenerateWorkflow} leftIcon={Sparkles}>
          Generate workflow
        </Chip>
        <Chip onClick={onDebugLastRun} leftIcon={Bug}>
          Debug last run
        </Chip>
        {selectedBlockId ? (
          <Chip onClick={onExplainBlock} leftIcon={MessageSquarePlus}>
            Explain block
          </Chip>
        ) : null}
        <Chip onClick={onClear} leftIcon={Trash2}>
          Clear chat
        </Chip>
      </div>

      <div className='flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-3'>
        {messages.length === 0 ? (
          <div className='flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center'>
            <p className='text-[14px] font-medium text-[var(--text-body)]'>Arena Copilot</p>
            <p className='text-[13px] text-[var(--text-muted)]'>
              Build, debug, and understand workflows using natural language. Changes require your
              confirmation before applying.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                'max-w-[95%] rounded-lg px-3 py-2 text-[13px]',
                message.role === 'user'
                  ? 'ml-auto bg-[var(--surface-accent)] text-[var(--text-body)]'
                  : 'mr-auto bg-[var(--surface-2)] text-[var(--text-body)]'
              )}
            >
              <p className='whitespace-pre-wrap'>{message.text || (message.streaming ? '…' : '')}</p>
              {message.recommendations?.length ? (
                <ul className='mt-2 list-disc pl-4 text-[12px] text-[var(--text-muted)]'>
                  {message.recommendations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))
        )}

        {pendingPatch?.patch ? (
          <div className='flex flex-col gap-2'>
            {showDiff ? <PatchPreview patch={pendingPatch.patch} /> : null}
            <div className='flex flex-wrap gap-2'>
              <Button size='sm' variant='secondary' onClick={onToggleDiff}>
                {showDiff ? 'Hide diff' : 'View diff'}
              </Button>
              <Button size='sm' onClick={onApplyPatch} disabled={isApplying}>
                Apply patch
              </Button>
              <Button size='sm' variant='ghost' onClick={onRejectPatch} disabled={isApplying}>
                Reject
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className='border-t border-[var(--border-subtle)] p-3'>
        <div className='flex gap-2'>
          <ChipTextarea
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            placeholder='Ask Copilot to build, edit, or debug this workflow…'
            rows={2}
            className='min-h-[72px] flex-1'
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                onSend()
              }
            }}
          />
          <Button onClick={onSend} disabled={isStreaming || !input.trim()}>
            Send
          </Button>
        </div>
      </div>
    </div>
  )
}

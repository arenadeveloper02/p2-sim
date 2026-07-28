'use client'

import { useState } from 'react'
import { Button, cn } from '@sim/emcn'
import { X } from 'lucide-react'
import { LocalCopilotChat } from '@/local-copilot/components/local-copilot-chat'
import { useLocalCopilot, useLocalCopilotConfig } from '@/local-copilot/hooks/use-local-copilot'

interface LocalCopilotPanelProps {
  workspaceId: string
  workflowId: string
  selectedBlockId?: string
  executionId?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onPatchApplied?: () => void
  className?: string
  /** Embedded inside workflow panel — hides outer chrome. */
  variant?: 'drawer' | 'embedded'
}

/**
 * Self-contained Arena Copilot drawer panel.
 * Mount in the workflow editor without modifying existing copilot code.
 */
export function LocalCopilotPanel({
  workspaceId,
  workflowId,
  selectedBlockId,
  executionId,
  open = true,
  onOpenChange,
  onPatchApplied,
  className,
  variant = 'drawer',
}: LocalCopilotPanelProps) {
  const [input, setInput] = useState('')
  const { data: config } = useLocalCopilotConfig()
  const copilot = useLocalCopilot({
    workspaceId,
    workflowId,
    selectedBlockId,
    executionId,
    onPatchApplied,
  })

  if (!open) return null

  if (config && !config.enabled) {
    return (
      <aside
        className={cn(
          variant === 'embedded'
            ? 'flex h-full min-h-0 w-full flex-col'
            : 'flex h-full w-[380px] flex-col border-[var(--border-subtle)] border-l bg-[var(--surface-0)]',
          className
        )}
      >
        {variant === 'drawer' ? <PanelHeader onClose={() => onOpenChange?.(false)} /> : null}
        <div className='flex flex-1 items-center justify-center p-4 text-center text-[13px] text-[var(--text-muted)]'>
          Arena Copilot is disabled. Set COPILOT_ENABLED=true and configure ANTHROPIC_API_KEY or
          ANTHROPIC_API_KEY_1 through _3.
        </div>
      </aside>
    )
  }

  return (
    <aside
      className={cn(
        variant === 'embedded'
          ? 'flex h-full min-h-0 w-full flex-col bg-transparent'
          : 'flex h-full w-[380px] flex-col border-[var(--border-subtle)] border-l bg-[var(--surface-0)]',
        className
      )}
    >
      {variant === 'drawer' ? (
        <PanelHeader
          onClose={() => onOpenChange?.(false)}
          subtitle={config ? `${config.provider} · ${config.model}` : undefined}
        />
      ) : null}
      <LocalCopilotChat
        className='min-h-0 flex-1'
        messages={copilot.messages}
        isStreaming={copilot.isStreaming}
        input={input}
        onInputChange={setInput}
        onSend={(message) => {
          const text = message?.trim() || input.trim()
          if (!text) return
          void copilot.sendMessage(text)
          setInput('')
        }}
        onClear={copilot.clearChat}
        onDebugLastRun={copilot.debugLastRun}
        onExplainBlock={copilot.explainSelectedBlock}
        onGenerateWorkflow={copilot.generateWorkflow}
        selectedBlockId={selectedBlockId}
        pendingPatch={copilot.pendingPatch}
        showDiff={copilot.showDiff}
        onToggleDiff={() => copilot.setShowDiff(!copilot.showDiff)}
        onApplyPatch={() => {
          if (copilot.pendingPatch) {
            void copilot.applyPatch.mutateAsync(copilot.pendingPatch.patchId)
          }
        }}
        onRejectPatch={() => {
          if (copilot.pendingPatch) {
            void copilot.rejectPatch.mutateAsync(copilot.pendingPatch.patchId)
          }
        }}
        isApplying={copilot.applyPatch.isPending}
      />
    </aside>
  )
}

function PanelHeader({ onClose, subtitle }: { onClose: () => void; subtitle?: string }) {
  return (
    <div className='flex items-center justify-between border-[var(--border-subtle)] border-b px-3 py-2'>
      <div>
        <p className='font-medium text-[14px] text-[var(--text-body)]'>Arena Copilot</p>
        {subtitle ? <p className='text-[11px] text-[var(--text-muted)]'>{subtitle}</p> : null}
      </div>
      <Button size='sm' variant='ghost' onClick={onClose} aria-label='Close Arena Copilot'>
        <X className='size-[14px]' />
      </Button>
    </div>
  )
}

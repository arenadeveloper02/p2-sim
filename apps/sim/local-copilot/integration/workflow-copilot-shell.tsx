'use client'

import type { ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { LocalCopilotPanel } from '@/local-copilot/components/local-copilot-panel'
import { useLocalCopilotConfig } from '@/local-copilot/hooks/use-local-copilot'

interface WorkflowCopilotShellProps {
  workspaceId: string
  workflowId: string
  executionId?: string
  selectedBlockId?: string
  onPatchApplied?: () => void
  /** Existing Mothership copilot UI — used when Arena Copilot is disabled. */
  mothershipChat: ReactNode
}

/**
 * Switches workflow copilot between Arena Copilot (in-process Anthropic) and
 * the remote SIM agent (SIM_AGENT_API_URL / copilot.sim.ai).
 */
export function WorkflowCopilotShell({
  workspaceId,
  workflowId,
  executionId,
  selectedBlockId,
  onPatchApplied,
  mothershipChat,
}: WorkflowCopilotShellProps) {
  const queryClient = useQueryClient()
  const { data: config, isLoading } = useLocalCopilotConfig()

  if (isLoading) {
    return (
      <div className='flex min-h-0 flex-1 items-center justify-center text-[13px] text-[var(--text-muted)]'>
        Loading copilot…
      </div>
    )
  }

  if (config?.enabled) {
    return (
      <LocalCopilotPanel
        workspaceId={workspaceId}
        workflowId={workflowId}
        selectedBlockId={selectedBlockId}
        executionId={executionId}
        open
        variant='embedded'
        className='min-h-0 w-full flex-1 border-0'
        onPatchApplied={() => {
          void queryClient.invalidateQueries({ queryKey: ['workflow'] })
          onPatchApplied?.()
        }}
      />
    )
  }

  return mothershipChat
}

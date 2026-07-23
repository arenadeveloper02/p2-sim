'use client'

import type { ReactNode } from 'react'

interface WorkflowCopilotShellProps {
  workspaceId: string
  workflowId: string
  executionId?: string
  selectedBlockId?: string
  onPatchApplied?: () => void
  /** Mothership chat UI with Local / Cloud switch in the input toolbar. */
  mothershipChat: ReactNode
}

/**
 * Workflow copilot shell — always renders the shared Mothership chat UI.
 * Local vs Cloud routing is controlled by the input toolbar switch and enforced server-side.
 */
export function WorkflowCopilotShell({ mothershipChat }: WorkflowCopilotShellProps) {
  return mothershipChat
}

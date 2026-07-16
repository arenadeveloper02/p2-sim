'use client'

import { useCopilotBackendPreference } from '@/local-copilot/hooks/use-copilot-backend-preference'
import { useLocalLiveStatus } from '@/local-copilot/hooks/use-local-live-status'

/**
 * Local Copilot only: engagement panel while the agent is still writing/compiling
 * a preview that has nothing renderable yet. Also activates when live status is
 * flowing (long tools after the edit lock releases).
 */
export function useLocalGeneratingPreviewEngagement(isAgentEditing?: boolean): boolean {
  const { copilotBackend } = useCopilotBackendPreference()
  const liveStatus = useLocalLiveStatus()
  return (
    copilotBackend === 'local' && (Boolean(isAgentEditing) || Boolean(liveStatus?.trim()))
  )
}

export { LocalCopilotPanel } from '@/local-copilot/components/local-copilot-panel'
export { LocalCopilotChat } from '@/local-copilot/components/local-copilot-chat'
export { PatchPreview } from '@/local-copilot/components/patch-preview'
export { WorkflowCopilotShell } from '@/local-copilot/integration/workflow-copilot-shell'
export { runLocalCopilotMothershipLifecycle } from '@/local-copilot/integration/mothership-lifecycle'
export { useLocalCopilot, useLocalCopilotConfig, localCopilotKeys } from '@/local-copilot/hooks/use-local-copilot'
export { useCopilotBackendPreference } from '@/local-copilot/hooks/use-copilot-backend-preference'
export {
  isLocalCopilotEnabledForUser,
  isUserAllowedForLocalCopilot,
  localCopilotUserAccessDeniedResponse,
  requireLocalCopilotAccess,
  requireLocalCopilotUserAccess,
} from '@/local-copilot/lib/access'
export {
  isLocalCopilotBackendActive,
  shouldRouteToLocalCopilot,
  shouldUseLocalCopilotChat,
} from '@/local-copilot/lib/routing'
export { resolveSimAgentApiUrl } from '@/local-copilot/lib/sim-agent-url'
export type { LocalCopilotMessage, UseLocalCopilotOptions } from '@/local-copilot/hooks/use-local-copilot'
export type { WorkflowPatchWire } from '@/local-copilot/contracts/local-copilot'

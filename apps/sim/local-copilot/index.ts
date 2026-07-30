export { LocalCopilotChat } from '@/local-copilot/components/local-copilot-chat'
export { LocalCopilotPanel } from '@/local-copilot/components/local-copilot-panel'
export { PatchPreview } from '@/local-copilot/components/patch-preview'
export type { WorkflowPatchWire } from '@/local-copilot/contracts/local-copilot'
export { useCopilotBackendPreference } from '@/local-copilot/hooks/use-copilot-backend-preference'
export type {
  LocalCopilotMessage,
  UseLocalCopilotOptions,
} from '@/local-copilot/hooks/use-local-copilot'
export {
  localCopilotKeys,
  useLocalCopilot,
  useLocalCopilotConfig,
} from '@/local-copilot/hooks/use-local-copilot'
export { runLocalCopilotMothershipLifecycle } from '@/local-copilot/integration/mothership-lifecycle'
export { WorkflowCopilotShell } from '@/local-copilot/integration/workflow-copilot-shell'
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

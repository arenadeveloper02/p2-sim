import {
  isDocSandboxEnabled,
  isMothershipSandboxEnabled,
  isRemoteSandboxEnabled,
  isSandboxesEnabled,
} from '@/lib/core/config/env-flags'

/**
 * Server-owned sandbox profile for local Copilot `function_execute`.
 * Matches hosted Mothership (`runCopilotLifecycle` stamps `'mothership'` on
 * `/api/copilot`). Unset when no remote sandbox is configured so import-free
 * JavaScript still runs in isolated-vm.
 */
export function getLocalCopilotSandboxProfile(): 'mothership' | undefined {
  return isMothershipSandboxEnabled || isRemoteSandboxEnabled ? 'mothership' : undefined
}

export interface LocalCopilotE2bCapabilities {
  /** Remote sandboxes available (`E2B_ENABLED`/`SANDBOX_PROVIDER` + API key). */
  enabled: boolean
  /** PPTX/DOCX/PDF/XLSX compile via doc sandbox template. */
  docSandboxEnabled: boolean
  /** Persistent custom Sim sandboxes (`manage_sandbox` + `function_execute` sandboxId). */
  customSandboxesEnabled: boolean
  /** Languages `function_execute` can run in the current deployment. */
  supportedCodeLanguages: Array<'javascript' | 'python' | 'shell'>
}

/**
 * Summarizes remote-sandbox availability for Arena Copilot context and tool selection.
 */
export function getLocalCopilotE2bCapabilities(): LocalCopilotE2bCapabilities {
  const enabled = isRemoteSandboxEnabled
  return {
    enabled,
    docSandboxEnabled: isDocSandboxEnabled,
    customSandboxesEnabled: isSandboxesEnabled,
    supportedCodeLanguages: enabled ? ['javascript', 'python', 'shell'] : ['javascript'],
  }
}

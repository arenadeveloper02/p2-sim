import {
  isDocSandboxEnabled,
  isMothershipSandboxEnabled,
  isRemoteSandboxEnabled,
  isSandboxesEnabled,
} from '@/lib/core/config/env-flags'

/**
 * Server-owned sandbox profile for local Copilot `function_execute`.
 * Matches hosted Mothership (`runCopilotLifecycle` stamps `'mothership'` on
 * `/api/copilot`). Unset when no remote sandbox is configured — Arena Copilot
 * does not fall back to isolated-vm for agent compute.
 *
 * The configured `MOTHERSHIP_E2B_TEMPLATE_ID` image is Python-oriented (no JS
 * runtime for agent compute); shell still runs on that image.
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
  /**
   * Languages Arena Copilot may pass to `function_execute`.
   * Mothership template is Python-based: python + shell when remote sandbox is
   * on; empty when off (no isolated-vm JavaScript fallback for agent compute).
   */
  supportedCodeLanguages: Array<'python' | 'shell'>
}

/**
 * Summarizes remote-sandbox availability for Arena Copilot context and tool selection.
 * Matches the Mothership template: Python + shell (not JavaScript).
 */
export function getLocalCopilotE2bCapabilities(): LocalCopilotE2bCapabilities {
  const enabled = isRemoteSandboxEnabled
  return {
    enabled,
    docSandboxEnabled: isDocSandboxEnabled,
    customSandboxesEnabled: isSandboxesEnabled,
    supportedCodeLanguages: enabled ? ['python', 'shell'] : [],
  }
}

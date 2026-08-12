import { isDocSandboxEnabled, isRemoteSandboxEnabled } from '@/lib/core/config/env-flags'

export interface LocalCopilotE2bCapabilities {
  /** Remote sandboxes available (`E2B_ENABLED`/`SANDBOX_PROVIDER` + API key). */
  enabled: boolean
  /** PPTX/DOCX/PDF/XLSX compile via doc sandbox template. */
  docSandboxEnabled: boolean
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
    supportedCodeLanguages: enabled ? ['javascript', 'python', 'shell'] : ['javascript'],
  }
}

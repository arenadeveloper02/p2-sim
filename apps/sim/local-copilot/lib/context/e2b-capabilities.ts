import { isE2BDocEnabled, isE2bEnabled } from '@/lib/core/config/env-flags'

export interface LocalCopilotE2bCapabilities {
  /** E2B remote sandboxes available (`E2B_ENABLED` + `E2B_API_KEY`). */
  enabled: boolean
  /** PPTX/DOCX/PDF/XLSX compile via E2B doc template. */
  docSandboxEnabled: boolean
  /** Languages `function_execute` can run in the current deployment. */
  supportedCodeLanguages: Array<'javascript' | 'python' | 'shell'>
}

/**
 * Summarizes E2B availability for Arena Copilot context and tool selection.
 */
export function getLocalCopilotE2bCapabilities(): LocalCopilotE2bCapabilities {
  const enabled = isE2bEnabled
  return {
    enabled,
    docSandboxEnabled: isE2BDocEnabled,
    supportedCodeLanguages: enabled ? ['javascript', 'python', 'shell'] : ['javascript'],
  }
}

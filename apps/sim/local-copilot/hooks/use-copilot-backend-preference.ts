'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  readCopilotBackendPreference,
  type CopilotBackendPreference,
  writeCopilotBackendPreference,
} from '@/local-copilot/lib/copilot-backend-preference'
import { useLocalCopilotConfig } from '@/local-copilot/hooks/use-local-copilot'

export function useCopilotBackendPreference(): {
  canSwitchBackend: boolean
  copilotBackend: CopilotBackendPreference
  setCopilotBackend: (value: CopilotBackendPreference) => void
} {
  const { data: config, isSuccess } = useLocalCopilotConfig()
  const canSwitchBackend = isSuccess ? Boolean(config?.canSwitchBackend) : false
  const localOnly = isSuccess ? Boolean(config?.localOnly) : false
  const [copilotBackend, setCopilotBackendState] = useState<CopilotBackendPreference>(() =>
    readCopilotBackendPreference()
  )

  useEffect(() => {
    if (canSwitchBackend) {
      setCopilotBackendState(readCopilotBackendPreference())
    }
  }, [canSwitchBackend])

  const setCopilotBackend = useCallback((value: CopilotBackendPreference) => {
    setCopilotBackendState(value)
    writeCopilotBackendPreference(value)
  }, [])

  // Resolve the effective backend once config loads:
  // local-only forces `local`; full access honors the stored preference;
  // no access forces `external` (Cloud).
  const effectiveBackend: CopilotBackendPreference = !isSuccess
    ? copilotBackend
    : localOnly
      ? 'local'
      : canSwitchBackend
        ? copilotBackend
        : 'external'

  return {
    canSwitchBackend,
    copilotBackend: effectiveBackend,
    setCopilotBackend,
  }
}

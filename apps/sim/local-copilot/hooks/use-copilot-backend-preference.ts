'use client'

import { useCallback, useEffect, useState } from 'react'
import { useLocalCopilotConfig } from '@/local-copilot/hooks/use-local-copilot'
import {
  type CopilotBackendPreference,
  readCopilotBackendPreference,
  writeCopilotBackendPreference,
} from '@/local-copilot/lib/copilot-backend-preference'

export function useCopilotBackendPreference(): {
  canSwitchBackend: boolean
  copilotBackend: CopilotBackendPreference
  setCopilotBackend: (value: CopilotBackendPreference) => void
} {
  const { data: config, isSuccess } = useLocalCopilotConfig()
  const canSwitchBackend = isSuccess ? Boolean(config?.canSwitchBackend) : false
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

  const effectiveBackend: CopilotBackendPreference = !isSuccess
    ? copilotBackend
    : canSwitchBackend
      ? copilotBackend
      : 'external'

  return {
    canSwitchBackend,
    copilotBackend: effectiveBackend,
    setCopilotBackend,
  }
}

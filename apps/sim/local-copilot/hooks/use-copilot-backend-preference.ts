'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  useLocalCopilotConfig,
  useUpdateLocalCopilotDefaultModel,
} from '@/local-copilot/hooks/use-local-copilot'
import {
  type CopilotBackendPreference,
  readCopilotBackendPreference,
  writeCopilotBackendPreference,
} from '@/local-copilot/lib/copilot-backend-preference'
import {
  DEFAULT_LOCAL_COPILOT_CATALOG_ID,
  type LocalCopilotCatalogId,
  resolveLocalCopilotCatalogId,
} from '@/local-copilot/lib/model-catalog'

export function useCopilotBackendPreference(): {
  canSwitchBackend: boolean
  copilotBackend: CopilotBackendPreference
  setCopilotBackend: (value: CopilotBackendPreference) => void
  defaultCatalogId: LocalCopilotCatalogId
} {
  const { data: config, isSuccess } = useLocalCopilotConfig()
  const canSwitchBackend = isSuccess ? Boolean(config?.canSwitchBackend) : false
  const localOnly = isSuccess ? Boolean(config?.localOnly) : false
  const defaultCatalogId = isSuccess
    ? resolveLocalCopilotCatalogId(config?.defaultCatalogId)
    : DEFAULT_LOCAL_COPILOT_CATALOG_ID
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
    defaultCatalogId,
  }
}

/**
 * Local catalog selection is the per-user enum default, not mothership `chat.model`.
 */
export function useLocalCopilotCatalogSelection() {
  const preference = useCopilotBackendPreference()
  const { mutate: persistDefaultModel } = useUpdateLocalCopilotDefaultModel()
  const setLocalCopilotCatalogId = useCallback(
    (id: LocalCopilotCatalogId) => {
      persistDefaultModel(id)
    },
    [persistDefaultModel]
  )

  return {
    ...preference,
    localCopilotCatalogId: preference.defaultCatalogId,
    setLocalCopilotCatalogId,
  }
}

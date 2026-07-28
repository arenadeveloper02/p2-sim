export type CopilotBackendPreference = 'local' | 'external'

const STORAGE_KEY = 'arena-copilot-backend-preference'

export function readCopilotBackendPreference(): CopilotBackendPreference {
  if (typeof window === 'undefined') return 'local'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  return stored === 'external' ? 'external' : 'local'
}

export function writeCopilotBackendPreference(value: CopilotBackendPreference): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_KEY, value)
}

export function parseCopilotBackendPreference(
  value: unknown
): CopilotBackendPreference | undefined {
  if (value === 'local' || value === 'external') return value
  return undefined
}

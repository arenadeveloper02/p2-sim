'use client'

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'

interface GenerativeAppHostStateValue {
  state: Record<string, unknown>
  mergeState: (patch: Record<string, unknown>) => void
}

const GenerativeAppHostStateContext = createContext<GenerativeAppHostStateValue | null>(null)

interface GenerativeAppHostStateProviderProps {
  children: ReactNode
}

/**
 * Holds CTA `setState` above the `[[...path]]` page so in-app navigation does
 * not remount the host and drop the API result.
 */
export function GenerativeAppHostStateProvider({ children }: GenerativeAppHostStateProviderProps) {
  const [state, setState] = useState<Record<string, unknown>>({})
  const mergeState = useCallback((patch: Record<string, unknown>) => {
    setState((current) => ({ ...current, ...patch }))
  }, [])
  const value = useMemo(() => ({ state, mergeState }), [state, mergeState])
  return (
    <GenerativeAppHostStateContext.Provider value={value}>
      {children}
    </GenerativeAppHostStateContext.Provider>
  )
}

/**
 * Host CTA state. Uses the layout provider when present; otherwise local state
 * (tests and any host rendered without the layout).
 */
export function useGenerativeAppHostState(): GenerativeAppHostStateValue {
  const context = useContext(GenerativeAppHostStateContext)
  const [localState, setLocalState] = useState<Record<string, unknown>>({})
  const mergeLocalState = useCallback((patch: Record<string, unknown>) => {
    setLocalState((current) => ({ ...current, ...patch }))
  }, [])
  const localValue = useMemo(
    () => ({ state: localState, mergeState: mergeLocalState }),
    [localState, mergeLocalState]
  )
  return context ?? localValue
}

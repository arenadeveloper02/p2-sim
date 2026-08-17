'use client'

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

interface GenerativeAppHostStateValue {
  state: Record<string, unknown>
  mergeState: (patch: Record<string, unknown>) => void
  streamPending: boolean
  setStreamPending: (pending: boolean) => void
}

const GenerativeAppHostStateContext = createContext<GenerativeAppHostStateValue | null>(null)

interface GenerativeAppHostStateProviderProps {
  children: ReactNode
}

/**
 * Holds CTA `setState` and stream pending above the `[[...path]]` page so
 * in-app navigation does not remount the host and drop the API result.
 */
export function GenerativeAppHostStateProvider({ children }: GenerativeAppHostStateProviderProps) {
  const [state, setState] = useState<Record<string, unknown>>({})
  const [streamPending, setStreamPending] = useState(false)
  const mergeState = useCallback((patch: Record<string, unknown>) => {
    setState((current) => ({ ...current, ...patch }))
  }, [])
  const value = useMemo(
    () => ({ state, mergeState, streamPending, setStreamPending }),
    [state, mergeState, streamPending]
  )
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
  const [localStreamPending, setLocalStreamPending] = useState(false)
  const mergeLocalState = useCallback((patch: Record<string, unknown>) => {
    setLocalState((current) => ({ ...current, ...patch }))
  }, [])
  const localValue = useMemo(
    () => ({
      state: localState,
      mergeState: mergeLocalState,
      streamPending: localStreamPending,
      setStreamPending: setLocalStreamPending,
    }),
    [localState, mergeLocalState, localStreamPending]
  )
  return context ?? localValue
}

'use client'

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

interface GenerativeAppHostStateValue {
  state: Record<string, unknown>
  mergeState: (patch: Record<string, unknown>) => void
  actionPending: boolean
  setActionPending: (pending: boolean) => void
}

const GenerativeAppHostStateContext = createContext<GenerativeAppHostStateValue | null>(null)

interface GenerativeAppHostStateProviderProps {
  children: ReactNode
}

/**
 * Holds CTA `setState` and the action-pending flag above the `[[...path]]` page. Both must outlive
 * navigation: a CTA navigates to its result page before the request finishes, so a remount here
 * would drop the API result and clear the flag that drives every loading placeholder.
 */
export function GenerativeAppHostStateProvider({ children }: GenerativeAppHostStateProviderProps) {
  const [state, setState] = useState<Record<string, unknown>>({})
  const [actionPending, setActionPending] = useState(false)
  const mergeState = useCallback((patch: Record<string, unknown>) => {
    setState((current) => ({ ...current, ...patch }))
  }, [])
  const value = useMemo(
    () => ({ state, mergeState, actionPending, setActionPending }),
    [state, mergeState, actionPending]
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
  const [localActionPending, setLocalActionPending] = useState(false)
  const mergeLocalState = useCallback((patch: Record<string, unknown>) => {
    setLocalState((current) => ({ ...current, ...patch }))
  }, [])
  const localValue = useMemo(
    () => ({
      state: localState,
      mergeState: mergeLocalState,
      actionPending: localActionPending,
      setActionPending: setLocalActionPending,
    }),
    [localState, mergeLocalState, localActionPending]
  )
  return context ?? localValue
}

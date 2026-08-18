'use client'

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'

interface GenerativeAppHostStateValue {
  state: Record<string, unknown>
  mergeState: (patch: Record<string, unknown>) => void
  resetState: () => void
  actionPending: boolean
  setActionPending: (pending: boolean) => void
  loadPending: boolean
  setLoadPending: (pending: boolean) => void
}

const GenerativeAppHostStateContext = createContext<GenerativeAppHostStateValue | null>(null)

interface GenerativeAppHostStateProviderProps {
  children: ReactNode
}

function useHostStateValue(): GenerativeAppHostStateValue {
  const [state, setState] = useState<Record<string, unknown>>({})
  const [actionPending, setActionPending] = useState(false)
  const [loadPending, setLoadPending] = useState(false)
  const mergeState = useCallback((patch: Record<string, unknown>) => {
    setState((current) => ({ ...current, ...patch }))
  }, [])
  const resetState = useCallback(() => {
    setState({})
  }, [])
  return useMemo(
    () => ({
      state,
      mergeState,
      resetState,
      actionPending,
      setActionPending,
      loadPending,
      setLoadPending,
    }),
    [state, mergeState, resetState, actionPending, loadPending]
  )
}

/**
 * Holds CTA `setState` and the pending flags above the `[[...path]]` page. Both must outlive
 * navigation: a CTA navigates to its result page before the request finishes, so a remount here
 * would drop the API result and clear the flag that drives every loading placeholder.
 *
 * `actionPending` and `loadPending` are separate so a page's `onLoad` finishing cannot clear the
 * placeholders belonging to a CTA that is still in flight, or the other way round.
 */
export function GenerativeAppHostStateProvider({ children }: GenerativeAppHostStateProviderProps) {
  const value = useHostStateValue()
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
  const localValue = useHostStateValue()
  return context ?? localValue
}

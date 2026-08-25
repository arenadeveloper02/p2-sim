'use client'

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { mergeHostState } from '@/lib/arena-generative-ui/merge-host-state'

interface GenerativeAppHostStateValue {
  state: Record<string, unknown>
  mergeState: (patch: Record<string, unknown>, appendKeys?: readonly string[]) => void
  resetState: () => void
  pendingActionIds: ReadonlySet<string>
  /** True while any user-initiated CTA is in flight (skip destination onLoad). */
  actionPending: boolean
  setActionPending: (actionId: string, pending: boolean) => void
  loadPending: boolean
  setLoadPending: (actionId: string, pending: boolean) => void
}

const GenerativeAppHostStateContext = createContext<GenerativeAppHostStateValue | null>(null)

interface GenerativeAppHostStateProviderProps {
  children: ReactNode
}

function togglePendingId(ids: string[], actionId: string, pending: boolean): string[] {
  if (pending) {
    return ids.includes(actionId) ? ids : [...ids, actionId]
  }
  return ids.filter((id) => id !== actionId)
}

function useHostStateValue(): GenerativeAppHostStateValue {
  const [state, setState] = useState<Record<string, unknown>>({})
  const [ctaPendingIds, setCtaPendingIds] = useState<string[]>([])
  const [loadPendingIds, setLoadPendingIds] = useState<string[]>([])
  const mergeState = useCallback(
    (patch: Record<string, unknown>, appendKeys?: readonly string[]) => {
      setState((current) => mergeHostState(current, patch, appendKeys))
    },
    []
  )
  const resetState = useCallback(() => {
    setState({})
  }, [])
  const setActionPending = useCallback((actionId: string, pending: boolean) => {
    setCtaPendingIds((current) => togglePendingId(current, actionId, pending))
  }, [])
  const setLoadPending = useCallback((actionId: string, pending: boolean) => {
    setLoadPendingIds((current) => togglePendingId(current, actionId, pending))
  }, [])
  const pendingActionIds = useMemo(
    () => new Set([...ctaPendingIds, ...loadPendingIds]),
    [ctaPendingIds, loadPendingIds]
  )
  return useMemo(
    () => ({
      state,
      mergeState,
      resetState,
      pendingActionIds,
      actionPending: ctaPendingIds.length > 0,
      setActionPending,
      loadPending: loadPendingIds.length > 0,
      setLoadPending,
    }),
    [
      state,
      mergeState,
      resetState,
      pendingActionIds,
      ctaPendingIds,
      setActionPending,
      loadPendingIds,
      setLoadPending,
    ]
  )
}

/**
 * Holds CTA `setState` and the pending flags above the `[[...path]]` page. Both must outlive
 * navigation: a CTA navigates to its result page before the request finishes, so a remount here
 * would drop the API result and clear the flag that drives every loading placeholder.
 *
 * CTA and onLoad ids are tracked separately so a page's `onLoad` finishing cannot clear the
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

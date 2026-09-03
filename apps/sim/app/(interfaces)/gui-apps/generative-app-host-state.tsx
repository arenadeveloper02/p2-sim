'use client'

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react'
import { mergeHostState } from '@/lib/arena-generative-ui/merge-host-state'

interface GenerativeAppPageUi {
  formValues: Record<string, unknown>
  localPages: Record<string, number>
}

interface GenerativeAppHostStateValue {
  state: Record<string, unknown>
  mergeState: (patch: Record<string, unknown>, appendKeys?: readonly string[]) => void
  pendingActionIds: ReadonlySet<string>
  /** True while any user-initiated CTA is in flight (skip destination onLoad). */
  actionPending: boolean
  setActionPending: (actionId: string, pending: boolean) => void
  loadPending: boolean
  setLoadPending: (actionId: string, pending: boolean) => void
  /** True after this onLoad key has run once in the session (tab return). */
  hasVisitedLoad: (loadKey: string) => boolean
  markLoadVisited: (loadKey: string) => void
  pageFormValues: (pagePath: string) => Record<string, unknown>
  setPageFormValues: (pagePath: string, values: Record<string, unknown>) => void
  pageLocalPages: (pagePath: string) => Record<string, number>
  setPageLocalPages: (pagePath: string, pages: Record<string, number>) => void
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
  const visitedLoadKeysRef = useRef(new Set<string>())
  const [pageUi, setPageUi] = useState<Record<string, GenerativeAppPageUi>>({})
  const mergeState = useCallback(
    (patch: Record<string, unknown>, appendKeys?: readonly string[]) => {
      setState((current) => mergeHostState(current, patch, appendKeys))
    },
    []
  )
  const setActionPending = useCallback((actionId: string, pending: boolean) => {
    setCtaPendingIds((current) => togglePendingId(current, actionId, pending))
  }, [])
  const setLoadPending = useCallback((actionId: string, pending: boolean) => {
    setLoadPendingIds((current) => togglePendingId(current, actionId, pending))
  }, [])
  const hasVisitedLoad = useCallback((loadKey: string) => visitedLoadKeysRef.current.has(loadKey), [])
  const markLoadVisited = useCallback((loadKey: string) => {
    if (!loadKey) return
    visitedLoadKeysRef.current.add(loadKey)
  }, [])
  const pageFormValues = useCallback(
    (pagePath: string) => pageUi[pagePath]?.formValues ?? {},
    [pageUi]
  )
  const setPageFormValues = useCallback((pagePath: string, values: Record<string, unknown>) => {
    if (!pagePath) return
    setPageUi((current) => ({
      ...current,
      [pagePath]: { formValues: values, localPages: current[pagePath]?.localPages ?? {} },
    }))
  }, [])
  const pageLocalPages = useCallback(
    (pagePath: string) => pageUi[pagePath]?.localPages ?? {},
    [pageUi]
  )
  const setPageLocalPages = useCallback((pagePath: string, pages: Record<string, number>) => {
    if (!pagePath) return
    setPageUi((current) => ({
      ...current,
      [pagePath]: { formValues: current[pagePath]?.formValues ?? {}, localPages: pages },
    }))
  }, [])
  const pendingActionIds = useMemo(
    () => new Set([...ctaPendingIds, ...loadPendingIds]),
    [ctaPendingIds, loadPendingIds]
  )
  return useMemo(
    () => ({
      state,
      mergeState,
      pendingActionIds,
      actionPending: ctaPendingIds.length > 0,
      setActionPending,
      loadPending: loadPendingIds.length > 0,
      setLoadPending,
      hasVisitedLoad,
      markLoadVisited,
      pageFormValues,
      setPageFormValues,
      pageLocalPages,
      setPageLocalPages,
    }),
    [
      state,
      mergeState,
      pendingActionIds,
      ctaPendingIds,
      setActionPending,
      loadPendingIds,
      setLoadPending,
      hasVisitedLoad,
      markLoadVisited,
      pageFormValues,
      setPageFormValues,
      pageLocalPages,
      setPageLocalPages,
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

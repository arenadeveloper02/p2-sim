'use client'

import { useEffect, useRef } from 'react'
import { toError } from '@sim/utils/errors'
import type { RunDeployedAppActionResult } from '@/lib/arena-generative-ui/run-action'
import { clearedActionErrorState } from '@/lib/arena-generative-ui/types'

interface UsePageLoadActionsOptions {
  /** Page these actions belong to. Arriving at a different page re-runs the load. */
  pagePath: string
  /** Action ids declared in the page manifest's `onLoad`. */
  actionIds: string[]
  /** Values every load action receives, normally the page's query params. */
  values: Record<string, string>
  /** True while a CTA is in flight, in which case its result must not be reset away. */
  actionPending: boolean
  runAction: (
    actionId: string,
    values: Record<string, string>
  ) => Promise<RunDeployedAppActionResult>
  mergeState: (patch: Record<string, unknown>, appendKeys?: readonly string[]) => void
  resetState: () => void
  setLoadPending: (pending: boolean) => void
}

/**
 * Runs a page's `onLoad` actions once on arrival so the page can show data before
 * the user interacts with anything.
 *
 * A CTA that already navigated here owns the page: skip onLoad (and do not
 * `resetState`) so an empty refetch cannot wipe `setState`. `onSuccess.navigate`
 * is ignored for a load action — honouring it would bounce the user off the page.
 */
export function usePageLoadActions(options: UsePageLoadActionsOptions): void {
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const loadKey =
    options.actionIds.length > 0
      ? `${options.pagePath}|${options.actionIds.join(',')}|${JSON.stringify(options.values)}`
      : ''
  const startedKeyRef = useRef('')

  useEffect(() => {
    if (!loadKey) {
      // Visiting a page without onLoad must not leave the previous page's key in
      // place, or coming back to that page would be treated as already loaded.
      startedKeyRef.current = ''
      return
    }
    if (startedKeyRef.current === loadKey) {
      return
    }
    startedKeyRef.current = loadKey

    let cancelled = false
    const { actionIds, values, actionPending, runAction, mergeState, resetState, setLoadPending } =
      optionsRef.current

    if (actionPending) {
      mergeState(clearedActionErrorState())
      return
    }

    resetState()
    setLoadPending(true)

    void (async () => {
      const results = await Promise.allSettled(
        actionIds.map((actionId) => runAction(actionId, values))
      )
      if (cancelled) return

      let failure = ''
      for (const [index, result] of results.entries()) {
        if (result.status === 'rejected') {
          failure = failure || toError(result.reason).message || 'Failed to load this page'
          continue
        }
        if (result.value.setState) {
          mergeState(result.value.setState, result.value.appendKeys)
        }
        if (!result.value.ok) {
          failure = failure || result.value.error || `Action "${actionIds[index]}" failed`
        }
      }
      if (failure) {
        mergeState({ error: failure })
      }
      setLoadPending(false)
    })()

    return () => {
      cancelled = true
      // The flag lives in a provider that outlives this page, so a load abandoned
      // by navigation must clear it or every later placeholder stays stuck.
      setLoadPending(false)
    }
  }, [loadKey])
}

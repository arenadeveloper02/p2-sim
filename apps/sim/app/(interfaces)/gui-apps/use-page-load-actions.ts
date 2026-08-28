'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { toError } from '@sim/utils/errors'
import { visitorFacingActionError } from '@/lib/arena-generative-ui/action-runtime'
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
  setLoadPending: (actionId: string, pending: boolean) => void
}

export interface UsePageLoadActionsResult {
  /** Re-run current page onLoad without blanking existing data. */
  reload: () => void
  /** True after this page's onLoad has been attempted (or skipped for a CTA). */
  canRefresh: boolean
}

/**
 * Runs a page's `onLoad` actions once on arrival so the page can show data before
 * the user interacts with anything.
 *
 * A CTA that already navigated here owns the page: skip onLoad (and do not
 * `resetState`) so an empty refetch cannot wipe `setState`. `onSuccess.navigate`
 * is ignored for a load action — honouring it would bounce the user off the page.
 *
 * Each load action is pending independently so a stats Stat does not stay
 * skeletoned after its response arrived just because a sibling list is still
 * in flight. `reload` re-runs the same actions without `resetState`.
 */
export function usePageLoadActions(options: UsePageLoadActionsOptions): UsePageLoadActionsResult {
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const loadKey =
    options.actionIds.length > 0
      ? `${options.pagePath}|${options.actionIds.join(',')}|${JSON.stringify(options.values)}`
      : ''
  const startedKeyRef = useRef('')
  const generationRef = useRef(0)
  const [canRefresh, setCanRefresh] = useState(false)

  const runLoads = useCallback(async (reset: boolean) => {
    const generation = (generationRef.current += 1)
    const { actionIds, values, runAction, mergeState, resetState, setLoadPending } =
      optionsRef.current
    if (actionIds.length === 0) return

    if (reset) resetState()
    else mergeState(clearedActionErrorState())

    for (const actionId of actionIds) {
      setLoadPending(actionId, true)
    }

    const results = await Promise.allSettled(
      actionIds.map(async (actionId) => {
        try {
          const result = await runAction(actionId, values)
          if (generation === generationRef.current && result.setState) {
            mergeState(result.setState, result.appendKeys)
          }
          return result
        } finally {
          if (generation === generationRef.current) setLoadPending(actionId, false)
        }
      })
    )
    if (generation !== generationRef.current) return

    let failure = ''
    for (const [index, result] of results.entries()) {
      if (result.status === 'rejected') {
        failure = failure || toError(result.reason).message || 'Failed to load this page'
        continue
      }
      if (!result.value.ok) {
        failure = failure || result.value.error || `Action "${actionIds[index]}" failed`
      }
    }
    if (failure) {
      mergeState({ error: visitorFacingActionError(failure) })
    }
  }, [])

  useEffect(() => {
    if (!loadKey) {
      startedKeyRef.current = ''
      generationRef.current += 1
      setCanRefresh(false)
      return
    }
    if (startedKeyRef.current === loadKey) {
      return
    }
    startedKeyRef.current = loadKey

    const { actionIds, actionPending, setLoadPending } = optionsRef.current
    setCanRefresh(true)

    if (actionPending) {
      optionsRef.current.mergeState(clearedActionErrorState())
      return
    }

    void runLoads(true)

    return () => {
      generationRef.current += 1
      startedKeyRef.current = ''
      for (const actionId of actionIds) {
        setLoadPending(actionId, false)
      }
    }
  }, [loadKey, runLoads])

  const reload = useCallback(() => {
    if (!startedKeyRef.current) return
    void runLoads(false)
  }, [runLoads])

  return { reload, canRefresh }
}

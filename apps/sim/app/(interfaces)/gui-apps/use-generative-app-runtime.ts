'use client'

import { useCallback, useRef, useState } from 'react'
import { toError } from '@sim/utils/errors'
import { flushSync } from 'react-dom'
import {
  createActionGenerationClock,
  type GenerativeAppLastAction,
  hostStatePatchFromResult,
  type RunGenerativeAppActionMeta,
  shouldShowSaveToast,
  visitorFacingActionError,
} from '@/lib/arena-generative-ui/action-runtime'
import { streamingContentState } from '@/lib/arena-generative-ui/consume-action-sse'
import type { RunDeployedAppActionResult } from '@/lib/arena-generative-ui/run-action'
import { clearedActionErrorState, submittedInputsState } from '@/lib/arena-generative-ui/types'
import type { ArenaGenerativeUxPlan } from '@/lib/arena-generative-ui/ux-compiler'
import { UX_DEFAULTS } from '@/lib/arena-generative-ui/ux-defaults'

interface LastAction extends GenerativeAppLastAction {
  kind: 'cta' | 'load'
}

interface UseGenerativeAppRuntimeOptions {
  runJson: (
    actionId: string,
    values: Record<string, unknown>,
    surface?: RunGenerativeAppActionMeta['surface']
  ) => Promise<RunDeployedAppActionResult>
  runStream: (
    actionId: string,
    values: Record<string, unknown>,
    onChunk: (accumulated: string) => void,
    surface?: RunGenerativeAppActionMeta['surface']
  ) => Promise<RunDeployedAppActionResult>
  isStreaming: (actionId: string) => boolean
  actionNavigate: Record<string, string>
  navigate: (path: string) => void
  mergeState: (patch: Record<string, unknown>, appendKeys?: readonly string[]) => void
  setActionPending: (actionId: string, pending: boolean) => void
  logger: {
    error: (message: string, meta?: Record<string, unknown>) => void
    warn: (message: string, meta?: Record<string, unknown>) => void
  }
  /** Compiler plan: confirm / retry / kind per action. Missing entry keeps prior defaults. */
  uxPlan?: ArenaGenerativeUxPlan
}

/**
 * Shared preview/published action overlays: generation id, Retry, save toast,
 * destructive confirm, and keeping streamed tokens on failure.
 */
export function useGenerativeAppRuntime(options: UseGenerativeAppRuntimeOptions) {
  const optionsRef = useRef(options)
  optionsRef.current = options
  const clockRef = useRef(createActionGenerationClock())
  const lastActionRef = useRef<LastAction | null>(null)
  const triggerRef = useRef<HTMLElement | null>(null)

  const [toast, setToast] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<GenerativeAppLastAction | null>(null)
  const [canRetry, setCanRetry] = useState(true)
  const inFlightRef = useRef(new Set<string>())

  const recordLastAction = (
    actionId: string,
    values: Record<string, unknown>,
    kind: LastAction['kind'],
    surface?: RunGenerativeAppActionMeta['surface']
  ) => {
    lastActionRef.current = { actionId, values, kind, surface }
    const plan = optionsRef.current.uxPlan?.actions[actionId]
    setCanRetry(plan ? plan.retry : true)
  }

  const beginFlight = (actionId: string): boolean => {
    if (UX_DEFAULTS.Button.preventDoubleSubmit && inFlightRef.current.has(actionId)) {
      return false
    }
    inFlightRef.current.add(actionId)
    return true
  }

  const endFlight = (actionId: string) => {
    inFlightRef.current.delete(actionId)
  }

  const shouldConfirm = (actionId: string, meta?: RunGenerativeAppActionMeta): boolean => {
    const plan = optionsRef.current.uxPlan?.actions[actionId]
    return plan ? plan.confirm : Boolean(meta?.destructive)
  }

  const execute = useCallback(
    async (
      actionId: string,
      values: Record<string, unknown>,
      generation: number,
      surface?: RunGenerativeAppActionMeta['surface']
    ) => {
      const current = optionsRef.current
      if (current.isStreaming(actionId)) {
        return current.runStream(
          actionId,
          values,
          (accumulated) => {
            if (!clockRef.current.isCurrent(actionId, generation)) return
            current.mergeState(streamingContentState(accumulated))
          },
          surface
        )
      }
      return current.runJson(actionId, values, surface)
    },
    []
  )

  const applyResult = useCallback((result: RunDeployedAppActionResult, skipNavigate: boolean) => {
    const current = optionsRef.current
    const { patch, appendKeys } = hostStatePatchFromResult(result)
    if (Object.keys(patch).length > 0 || appendKeys?.length) {
      flushSync(() => {
        current.mergeState(patch, appendKeys)
      })
    }
    if (!skipNavigate && result.navigate) {
      current.navigate(result.navigate)
    }
    if (!result.ok) {
      current.logger.warn('App action returned an error', { error: result.error })
    }
  }, [])

  const runCta = useCallback(
    async (
      actionId: string,
      values: Record<string, unknown>,
      surface?: RunGenerativeAppActionMeta['surface']
    ) => {
      if (!beginFlight(actionId)) return
      const current = optionsRef.current
      const generation = clockRef.current.begin(actionId)
      recordLastAction(actionId, values, 'cta', surface)
      const navigateTo = current.actionNavigate[actionId]
      const streaming = current.isStreaming(actionId)
      flushSync(() => {
        current.setActionPending(actionId, true)
        current.mergeState({
          ...clearedActionErrorState(),
          ...submittedInputsState(values),
        })
      })
      setToast(null)
      try {
        if (navigateTo) current.navigate(navigateTo)
        const result = await execute(actionId, values, generation, surface)
        if (!clockRef.current.isCurrent(actionId, generation)) return
        applyResult(result, Boolean(navigateTo))
        if (
          shouldShowSaveToast({
            ok: result.ok,
            navigateTo,
            resultNavigate: result.navigate,
            streaming,
            setState: result.setState,
          })
        ) {
          setToast('Saved')
        }
      } catch (error) {
        if (!clockRef.current.isCurrent(actionId, generation)) return
        current.logger.error('App action failed', { error: toError(error).message })
        current.mergeState({
          error: visitorFacingActionError(toError(error).message || 'Action failed'),
        })
      } finally {
        endFlight(actionId)
        if (clockRef.current.isCurrent(actionId, generation)) {
          current.setActionPending(actionId, false)
        }
      }
    },
    [applyResult, execute]
  )

  const runLoad = useCallback(
    async (actionId: string, values: Record<string, unknown>) => {
      if (!beginFlight(actionId)) return
      const current = optionsRef.current
      const generation = clockRef.current.begin(actionId)
      recordLastAction(actionId, values, 'load')
      current.setActionPending(actionId, true)
      current.mergeState(clearedActionErrorState())
      try {
        const result = await execute(actionId, values, generation)
        if (!clockRef.current.isCurrent(actionId, generation)) return
        applyResult(result, true)
      } catch (error) {
        if (!clockRef.current.isCurrent(actionId, generation)) return
        current.logger.error('App action failed', { error: toError(error).message })
        current.mergeState({
          error: visitorFacingActionError(toError(error).message || 'Action failed'),
        })
      } finally {
        endFlight(actionId)
        if (clockRef.current.isCurrent(actionId, generation)) {
          current.setActionPending(actionId, false)
        }
      }
    },
    [applyResult, execute]
  )

  const restoreTrigger = useCallback(() => {
    triggerRef.current?.focus()
    triggerRef.current = null
  }, [])

  const onRunAction = useCallback(
    async (
      actionId: string,
      values: Record<string, unknown>,
      meta?: RunGenerativeAppActionMeta
    ) => {
      if (shouldConfirm(actionId, meta)) {
        triggerRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null
        setConfirm({ actionId, values, surface: meta.surface })
        return
      }
      await runCta(actionId, values, meta?.surface)
    },
    [runCta]
  )

  const rememberLoad = useCallback((actionId: string, values: Record<string, unknown>) => {
    recordLastAction(actionId, values, 'load')
  }, [])

  const retry = useCallback(() => {
    const last = lastActionRef.current
    if (!last) return
    if (last.kind === 'load') {
      void runLoad(last.actionId, last.values)
      return
    }
    void runCta(last.actionId, last.values, last.surface)
  }, [runCta, runLoad])

  const dismissError = useCallback(() => {
    optionsRef.current.mergeState(clearedActionErrorState())
  }, [])

  const confirmDestructive = useCallback(() => {
    const pending = confirm
    setConfirm(null)
    restoreTrigger()
    if (pending) void runCta(pending.actionId, pending.values, pending.surface)
  }, [confirm, restoreTrigger, runCta])

  const cancelDestructive = useCallback(() => {
    setConfirm(null)
    restoreTrigger()
  }, [restoreTrigger])

  const cancelPending = useCallback(() => {
    const current = optionsRef.current
    const inflight = [...inFlightRef.current]
    for (const actionId of inflight) {
      clockRef.current.begin(actionId)
      current.setActionPending(actionId, false)
    }
    inFlightRef.current.clear()
  }, [])

  const clearToast = useCallback(() => {
    setToast(null)
  }, [])

  return {
    onRunAction,
    retry,
    canRetry,
    rememberLoad,
    dismissError,
    toast,
    clearToast,
    confirm,
    confirmDestructive,
    cancelDestructive,
    cancelPending,
  }
}

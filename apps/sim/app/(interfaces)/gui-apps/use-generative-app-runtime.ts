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
} from '@/lib/arena-generative-ui/action-runtime'
import { streamingContentState } from '@/lib/arena-generative-ui/consume-action-sse'
import type { RunDeployedAppActionResult } from '@/lib/arena-generative-ui/run-action'
import { clearedActionErrorState, submittedInputsState } from '@/lib/arena-generative-ui/types'

interface LastAction extends GenerativeAppLastAction {
  kind: 'cta' | 'load'
}

interface UseGenerativeAppRuntimeOptions {
  runJson: (
    actionId: string,
    values: Record<string, unknown>
  ) => Promise<RunDeployedAppActionResult>
  runStream: (
    actionId: string,
    values: Record<string, unknown>,
    onChunk: (accumulated: string) => void
  ) => Promise<RunDeployedAppActionResult>
  isStreaming: (actionId: string) => boolean
  actionNavigate: Record<string, string>
  navigate: (path: string) => void
  mergeState: (patch: Record<string, unknown>, appendKeys?: readonly string[]) => void
  setActionPending: (pending: boolean) => void
  logger: {
    error: (message: string, meta?: Record<string, unknown>) => void
    warn: (message: string, meta?: Record<string, unknown>) => void
  }
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

  const execute = useCallback(
    async (actionId: string, values: Record<string, unknown>, generation: number) => {
      const current = optionsRef.current
      if (current.isStreaming(actionId)) {
        return current.runStream(actionId, values, (accumulated) => {
          if (!clockRef.current.isCurrent(actionId, generation)) return
          current.mergeState(streamingContentState(accumulated))
        })
      }
      return current.runJson(actionId, values)
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
    async (actionId: string, values: Record<string, unknown>) => {
      const current = optionsRef.current
      const generation = clockRef.current.begin(actionId)
      lastActionRef.current = { actionId, values, kind: 'cta' }
      const navigateTo = current.actionNavigate[actionId]
      const streaming = current.isStreaming(actionId)
      flushSync(() => {
        current.setActionPending(true)
        current.mergeState({
          ...clearedActionErrorState(),
          ...submittedInputsState(values),
        })
      })
      setToast(null)
      try {
        if (navigateTo) current.navigate(navigateTo)
        const result = await execute(actionId, values, generation)
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
        current.mergeState({ error: toError(error).message || 'Action failed' })
      } finally {
        if (clockRef.current.isCurrent(actionId, generation)) {
          current.setActionPending(false)
        }
      }
    },
    [applyResult, execute]
  )

  const runLoad = useCallback(
    async (actionId: string, values: Record<string, unknown>) => {
      const current = optionsRef.current
      const generation = clockRef.current.begin(actionId)
      lastActionRef.current = { actionId, values, kind: 'load' }
      current.setActionPending(true)
      current.mergeState(clearedActionErrorState())
      try {
        const result = await execute(actionId, values, generation)
        if (!clockRef.current.isCurrent(actionId, generation)) return
        applyResult(result, true)
      } catch (error) {
        if (!clockRef.current.isCurrent(actionId, generation)) return
        current.logger.error('App action failed', { error: toError(error).message })
        current.mergeState({ error: toError(error).message || 'Action failed' })
      } finally {
        if (clockRef.current.isCurrent(actionId, generation)) {
          current.setActionPending(false)
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
      if (meta?.destructive) {
        triggerRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null
        setConfirm({ actionId, values })
        return
      }
      await runCta(actionId, values)
    },
    [runCta]
  )

  const rememberLoad = useCallback((actionId: string, values: Record<string, unknown>) => {
    lastActionRef.current = { actionId, values, kind: 'load' }
  }, [])

  const retry = useCallback(() => {
    const last = lastActionRef.current
    if (!last) return
    if (last.kind === 'load') {
      void runLoad(last.actionId, last.values)
      return
    }
    void runCta(last.actionId, last.values)
  }, [runCta, runLoad])

  const dismissError = useCallback(() => {
    optionsRef.current.mergeState(clearedActionErrorState())
  }, [])

  const confirmDestructive = useCallback(() => {
    const pending = confirm
    setConfirm(null)
    restoreTrigger()
    if (pending) void runCta(pending.actionId, pending.values)
  }, [confirm, restoreTrigger, runCta])

  const cancelDestructive = useCallback(() => {
    setConfirm(null)
    restoreTrigger()
  }, [restoreTrigger])

  const clearToast = useCallback(() => {
    setToast(null)
  }, [])

  return {
    onRunAction,
    retry,
    rememberLoad,
    dismissError,
    toast,
    clearToast,
    confirm,
    confirmDestructive,
    cancelDestructive,
  }
}

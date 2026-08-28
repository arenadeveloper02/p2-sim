/**
 * @vitest-environment jsdom
 */
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RunDeployedAppActionResult } from '@/lib/arena-generative-ui/run-action'
import {
  type UsePageLoadActionsResult,
  usePageLoadActions,
} from '@/app/(interfaces)/gui-apps/use-page-load-actions'

interface Harness {
  api: () => UsePageLoadActionsResult
  resetState: ReturnType<typeof vi.fn>
  runAction: ReturnType<typeof vi.fn>
  unmount: () => void
}

function renderLoads(options?: {
  actionIds?: string[]
  runAction?: () => Promise<RunDeployedAppActionResult>
}): Harness {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
  const resetState = vi.fn()
  const mergeState = vi.fn()
  const setLoadPending = vi.fn()
  const runAction =
    options?.runAction ??
    vi.fn().mockResolvedValue({ ok: true, setState: { rows: [{ name: 'Ada' }] } })
  let latest: UsePageLoadActionsResult = { reload: () => {}, canRefresh: false }

  function Probe() {
    const api = usePageLoadActions({
      pagePath: 'home',
      actionIds: options?.actionIds ?? ['load_rows'],
      values: {},
      actionPending: false,
      runAction,
      mergeState,
      resetState,
      setLoadPending,
    })
    useEffect(() => {
      latest = api
    })
    return null
  }

  act(() => {
    root.render(<Probe />)
  })

  return {
    api: () => latest,
    resetState,
    runAction,
    unmount: () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    },
  }
}

describe('usePageLoadActions', () => {
  let harness: Harness | undefined

  afterEach(() => {
    harness?.unmount()
    harness = undefined
  })

  it('resets on first visit and reloads without resetState', async () => {
    harness = renderLoads()
    await act(async () => {
      await Promise.resolve()
    })
    expect(harness.resetState).toHaveBeenCalledTimes(1)
    expect(harness.runAction).toHaveBeenCalledTimes(1)
    expect(harness.api().canRefresh).toBe(true)

    await act(async () => {
      harness?.api().reload()
      await Promise.resolve()
    })
    expect(harness.resetState).toHaveBeenCalledTimes(1)
    expect(harness.runAction).toHaveBeenCalledTimes(2)
  })

  it('does not offer Refresh when the page has no onLoad', async () => {
    harness = renderLoads({ actionIds: [] })
    await act(async () => {
      await Promise.resolve()
    })
    expect(harness.api().canRefresh).toBe(false)
    expect(harness.resetState).not.toHaveBeenCalled()
  })
})

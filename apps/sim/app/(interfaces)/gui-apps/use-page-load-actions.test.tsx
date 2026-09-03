/**
 * @vitest-environment jsdom
 */
import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RunDeployedAppActionResult } from '@/lib/arena-generative-ui/run-action'
import { clearedActionErrorState } from '@/lib/arena-generative-ui/types'
import { GenerativeAppHostStateProvider } from '@/app/(interfaces)/gui-apps/generative-app-host-state'
import {
  type UsePageLoadActionsResult,
  usePageLoadActions,
} from '@/app/(interfaces)/gui-apps/use-page-load-actions'

interface Harness {
  api: () => UsePageLoadActionsResult
  mergeState: ReturnType<typeof vi.fn>
  runAction: ReturnType<typeof vi.fn>
  unmount: () => void
}

function renderLoads(options?: {
  actionIds?: string[]
  actionHostKeys?: Record<string, readonly string[]>
  runAction?: () => Promise<RunDeployedAppActionResult>
}): Harness {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root: Root = createRoot(container)
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
      actionHostKeys: options?.actionHostKeys ?? { load_rows: ['rows', 'content'] },
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
    mergeState,
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

  it('drops load keys on first visit without wiping generate content, and reloads without dropping keys', async () => {
    harness = renderLoads()
    await act(async () => {
      await Promise.resolve()
    })
    expect(harness.mergeState).toHaveBeenCalledTimes(2)
    const arrival = harness.mergeState.mock.calls[0]?.[0] as Record<string, unknown>
    expect(arrival).toMatchObject({
      rows: undefined,
      selectedId: undefined,
    })
    expect(arrival).not.toHaveProperty('content')
    expect(harness.mergeState.mock.calls[1]?.[0]).toEqual({ rows: [{ name: 'Ada' }] })
    expect(harness.runAction).toHaveBeenCalledTimes(1)
    expect(harness.api().canRefresh).toBe(true)

    await act(async () => {
      harness?.api().reload()
      await Promise.resolve()
    })
    expect(harness.mergeState).toHaveBeenCalledTimes(4)
    expect(harness.mergeState.mock.calls[2]?.[0]).toEqual(clearedActionErrorState())
    expect(harness.runAction).toHaveBeenCalledTimes(2)
  })

  it('does not blank load keys when the same page remounts after a tab leave', async () => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    const mergeState = vi.fn()
    const setLoadPending = vi.fn()
    const runAction = vi.fn().mockResolvedValue({ ok: true, setState: { rows: [{ name: 'Ada' }] } })

    function Probe() {
      usePageLoadActions({
        pagePath: 'home',
        actionIds: ['load_rows'],
        values: {},
        actionPending: false,
        runAction,
        mergeState,
        actionHostKeys: { load_rows: ['rows'] },
        setLoadPending,
      })
      return null
    }

    act(() => {
      root.render(
        <GenerativeAppHostStateProvider>
          <Probe />
        </GenerativeAppHostStateProvider>
      )
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(mergeState.mock.calls[0]?.[0]).toMatchObject({ rows: undefined })

    act(() => {
      root.render(<GenerativeAppHostStateProvider>{null}</GenerativeAppHostStateProvider>)
    })
    mergeState.mockClear()
    runAction.mockClear()

    act(() => {
      root.render(
        <GenerativeAppHostStateProvider>
          <Probe />
        </GenerativeAppHostStateProvider>
      )
    })
    await act(async () => {
      await Promise.resolve()
    })

    expect(mergeState.mock.calls[0]?.[0]).toEqual(clearedActionErrorState())
    expect(runAction).toHaveBeenCalledTimes(1)

    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('does not offer Refresh when the page has no onLoad', async () => {
    harness = renderLoads({ actionIds: [] })
    await act(async () => {
      await Promise.resolve()
    })
    expect(harness.api().canRefresh).toBe(false)
    expect(harness.mergeState).not.toHaveBeenCalled()
  })
})

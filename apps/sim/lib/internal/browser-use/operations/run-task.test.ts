/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockEnv = vi.hoisted(() => ({
  BROWSER_USE_API_KEY: undefined as string | undefined,
  BROWSER_USE_BASE_URL: undefined as string | undefined,
}))

vi.mock('@/lib/core/config/env', () => ({
  env: mockEnv,
  getEnv: (key: string) => (mockEnv as Record<string, string | undefined>)[key],
  isTruthy: (value: unknown) => Boolean(value),
  isFalsy: () => false,
  envBoolean: () => false,
}))

import { executeRunTaskOperation } from '@/lib/internal/browser-use/operations/run-task'

const mockFetch = vi.fn<typeof fetch>()

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function mockSuccessfulTask() {
  mockFetch
    .mockResolvedValueOnce(jsonResponse({ id: 'task-1', sessionId: 'session-1' }))
    .mockResolvedValueOnce(
      jsonResponse({
        status: 'finished',
        sessionId: 'session-1',
        output: { result: 'complete' },
        steps: [],
      })
    )
    .mockResolvedValueOnce(
      jsonResponse({
        liveUrl: 'https://live.browser-use.com/session-1',
        publicShareUrl: 'https://browser-use.com/share/session-1',
      })
    )
}

describe('executeRunTaskOperation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEnv.BROWSER_USE_API_KEY = undefined
    mockEnv.BROWSER_USE_BASE_URL = undefined
    vi.stubGlobal('fetch', mockFetch)
  })

  afterEach(() => vi.unstubAllGlobals())

  it('validates provider payloads while preserving the documented task output', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'task-1', sessionId: 'session-1' }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'finished',
          sessionId: 'session-1',
          output: { result: 'complete' },
          steps: [
            {
              number: 1,
              memory: 'Opened the page',
              evaluationPreviousGoal: 'Succeeded',
              nextGoal: 'Finish',
              url: 'https://example.com',
              actions: ['{"click":{"index":1}}'],
              providerField: 'preserved',
            },
          ],
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          liveUrl: 'https://live.browser-use.com/session-1',
          publicShareUrl: 'https://browser-use.com/share/session-1',
        })
      )

    const result = await executeRunTaskOperation({ task: 'Open the page', apiKey: 'api-key' })

    expect(result).toEqual({
      success: true,
      output: {
        id: 'task-1',
        success: true,
        output: { result: 'complete' },
        steps: [
          {
            number: 1,
            memory: 'Opened the page',
            evaluationPreviousGoal: 'Succeeded',
            nextGoal: 'Finish',
            url: 'https://example.com',
            actions: ['{"click":{"index":1}}'],
            providerField: 'preserved',
          },
        ],
        liveUrl: 'https://live.browser-use.com/session-1',
        shareUrl: 'https://browser-use.com/share/session-1',
        sessionId: 'session-1',
      },
      error: undefined,
    })
    expect(mockFetch).toHaveBeenCalledTimes(3)
    for (const [, request] of mockFetch.mock.calls) {
      expect(request).toEqual(
        expect.objectContaining({
          redirect: 'error',
          headers: expect.objectContaining({ 'X-Browser-Use-API-Key': 'api-key' }),
        })
      )
    }
  })

  it('uses the created profile session to fetch the live URL when task status omits it', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'profile-session' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'task-1' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'finished', output: 'done' }))
      .mockResolvedValueOnce(
        jsonResponse({
          liveUrl: 'https://live.browser-use.com/profile-session',
          publicShareUrl: 'https://browser-use.com/share/profile-session',
        })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    const result = await executeRunTaskOperation({
      task: 'Open the page',
      apiKey: 'api-key',
      profile_id: 'profile-1',
    })

    expect(result.output).toMatchObject({
      sessionId: 'profile-session',
      liveUrl: 'https://live.browser-use.com/profile-session',
      shareUrl: 'https://browser-use.com/share/profile-session',
    })
    expect(mockFetch).toHaveBeenNthCalledWith(
      4,
      'https://api.browser-use.com/api/v2/sessions/profile-session',
      expect.objectContaining({ method: 'GET' })
    )
  })

  it('returns an actionable error for a terminal failed task', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'task-1' }))
      .mockResolvedValueOnce(
        jsonResponse({ status: 'failed', output: 'Navigation could not reach the target' })
      )

    const result = await executeRunTaskOperation({ task: 'Open the page', apiKey: 'api-key' })

    expect(result).toMatchObject({
      success: false,
      error: 'BrowserUse task failed: Navigation could not reach the target',
      output: {
        success: false,
        output: 'Navigation could not reach the target',
      },
    })
  })

  it('rejects a malformed successful create-task response', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ sessionId: 'session-1' }))

    await expect(
      executeRunTaskOperation({ task: 'Open the page', apiKey: 'api-key' })
    ).resolves.toEqual({
      success: false,
      output: {
        id: '',
        success: false,
        output: null,
        steps: [],
        liveUrl: null,
        shareUrl: null,
        sessionId: null,
      },
      error: 'BrowserUse returned an invalid create-task response',
    })
  })

  it('normalizes non-Error provider failures', async () => {
    mockFetch.mockRejectedValueOnce('provider unavailable')

    await expect(
      executeRunTaskOperation({ task: 'Open the page', apiKey: 'api-key' })
    ).resolves.toEqual({
      success: false,
      output: {
        id: '',
        success: false,
        output: null,
        steps: [],
        liveUrl: null,
        shareUrl: null,
        sessionId: null,
      },
      error: 'Error creating task: provider unavailable',
    })
  })

  it.each([
    ['an HTTP error', new Response('rejected', { status: 400, statusText: 'Bad Request' })],
    ['a schema-invalid success', jsonResponse({ sessionId: 'session-1' })],
  ])('stops a profile session when task creation returns %s', async (_case, taskResponse) => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'profile-session' }))
      .mockResolvedValueOnce(taskResponse)
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    const result = await executeRunTaskOperation({
      task: 'Open the page',
      apiKey: 'api-key',
      profile_id: 'profile-1',
    })

    expect(result.success).toBe(false)
    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'https://api.browser-use.com/api/v2/sessions/profile-session',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ action: 'stop' }),
        redirect: 'error',
        signal: expect.any(AbortSignal),
      })
    )
  })

  it('propagates cancellation while still stopping a created profile session', async () => {
    const controller = new AbortController()
    const abortError = new DOMException('cancelled', 'AbortError')
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'profile-session' }))
      .mockImplementationOnce(async (_input, request) => {
        expect(request?.signal).toBe(controller.signal)
        controller.abort(abortError)
        throw abortError
      })
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(
      executeRunTaskOperation(
        { task: 'Open the page', apiKey: 'api-key', profile_id: 'profile-1' },
        controller.signal
      )
    ).rejects.toBe(abortError)

    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'https://api.browser-use.com/api/v2/sessions/profile-session',
      expect.objectContaining({
        method: 'PATCH',
        redirect: 'error',
        signal: expect.any(AbortSignal),
      })
    )
    expect(mockFetch.mock.calls[2]?.[1]?.signal).not.toBe(controller.signal)
  })

  it('stops an automatically created task session when polling is cancelled', async () => {
    const controller = new AbortController()
    const abortError = new DOMException('cancelled', 'AbortError')
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'task-1', sessionId: 'task-session' }))
      .mockImplementationOnce(async () => {
        controller.abort(abortError)
        throw abortError
      })
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(
      executeRunTaskOperation({ task: 'Open the page', apiKey: 'api-key' }, controller.signal)
    ).rejects.toBe(abortError)

    expect(mockFetch).toHaveBeenNthCalledWith(
      3,
      'https://api.browser-use.com/api/v2/sessions/task-session',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ action: 'stop' }),
        signal: expect.any(AbortSignal),
      })
    )
  })

  it('stops an automatically created task session when polling times out', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(1_000_000_000_000_000)
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'task-1', sessionId: 'task-session' }))
      .mockResolvedValueOnce(jsonResponse({ status: 'running', sessionId: 'task-session' }))
      .mockResolvedValueOnce(
        jsonResponse({ shareUrl: 'https://browser-use.com/share/task-session' })
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    const result = await executeRunTaskOperation({ task: 'Open the page', apiKey: 'api-key' })
    now.mockRestore()

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('Task did not complete within the maximum polling time'),
    })
    expect(mockFetch).toHaveBeenNthCalledWith(
      4,
      'https://api.browser-use.com/api/v2/sessions/task-session',
      expect.objectContaining({ method: 'PATCH', signal: expect.any(AbortSignal) })
    )
  })

  it('uses BROWSER_USE_API_KEY from the server env when the block key is empty', async () => {
    mockEnv.BROWSER_USE_API_KEY = 'env-browser-use-key'
    mockSuccessfulTask()

    const result = await executeRunTaskOperation({ task: 'Open the page' })

    expect(result.success).toBe(true)
    for (const [, request] of mockFetch.mock.calls) {
      expect(request).toEqual(
        expect.objectContaining({
          headers: expect.objectContaining({ 'X-Browser-Use-API-Key': 'env-browser-use-key' }),
        })
      )
    }
  })

  it('prefers a block apiKey over BROWSER_USE_API_KEY', async () => {
    mockEnv.BROWSER_USE_API_KEY = 'env-browser-use-key'
    mockSuccessfulTask()

    await executeRunTaskOperation({ task: 'Open the page', apiKey: 'block-key' })

    expect(mockFetch.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Browser-Use-API-Key': 'block-key' }),
      })
    )
  })

  it('returns an error when neither the block nor env provides an API key', async () => {
    await expect(executeRunTaskOperation({ task: 'Open the page' })).resolves.toEqual({
      success: false,
      output: {
        id: '',
        success: false,
        output: null,
        steps: [],
        liveUrl: null,
        shareUrl: null,
        sessionId: null,
      },
      error:
        'Browser Use API key is required. Enter it in the block or set BROWSER_USE_API_KEY in the server environment.',
    })
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('uses BROWSER_USE_BASE_URL when set', async () => {
    mockEnv.BROWSER_USE_BASE_URL = 'https://browser-use.internal/api/v2/'
    mockSuccessfulTask()

    await executeRunTaskOperation({ task: 'Open the page', apiKey: 'api-key' })

    expect(mockFetch.mock.calls[0]?.[0]).toBe('https://browser-use.internal/api/v2/tasks')
  })

  it('forwards API-reported totalCostUsd as __totalCostUsd', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: 'task-1', sessionId: 'session-1' }))
      .mockResolvedValueOnce(
        jsonResponse({
          status: 'finished',
          sessionId: 'session-1',
          output: 'done',
          steps: [],
          totalCostUsd: 0.42,
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          liveUrl: null,
          publicShareUrl: 'https://browser-use.com/share/session-1',
        })
      )

    const result = await executeRunTaskOperation({ task: 'Open the page', apiKey: 'api-key' })

    expect(result.output.__totalCostUsd).toBe(0.42)
  })
})

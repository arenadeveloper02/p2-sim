/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/core/execution-limits', () => ({ getMaxExecutionTimeout: () => 5000 }))

import { generateVideo } from '@/lib/internal/video/client'

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const FALAI_SUBMIT_URL = 'https://queue.fal.run/fal-ai/veo3.1'

function falaiInput() {
  return {
    provider: 'falai' as const,
    apiKey: 'key',
    model: 'veo-3.1',
    prompt: 'A cinematic sunrise',
  }
}

describe('Video provider client', () => {
  beforeEach(() => vi.useFakeTimers())

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('submits a Fal.ai job once and only polls the returned request', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          request_id: 'fal-1',
          status_url: 'https://queue.fal.run/status/fal-1',
          response_url: 'https://queue.fal.run/response/fal-1',
        })
      )
      .mockResolvedValueOnce(jsonResponse({ status: 'COMPLETED' }))
      .mockResolvedValueOnce(
        jsonResponse({
          video: { url: 'https://cdn.example/fal.mp4', width: 1920, height: 1080, duration: 8 },
        })
      )
      .mockResolvedValueOnce(new Response(Buffer.from('video')))
    vi.stubGlobal('fetch', mockFetch)

    const resultPromise = generateVideo(falaiInput(), { requestId: 'request-1' })
    await vi.advanceTimersByTimeAsync(5000)
    const result = await resultPromise

    expect(result).toMatchObject({
      buffer: Buffer.from('video'),
      width: 1920,
      height: 1080,
      jobId: 'fal-1',
      duration: 8,
    })
    expect(String(mockFetch.mock.calls[0]?.[0])).toBe(FALAI_SUBMIT_URL)
    expect((mockFetch.mock.calls[0]?.[1] as RequestInit).method).toBe('POST')
    expect(
      mockFetch.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === 'POST'
      )
    ).toHaveLength(1)
  })

  it('cancels during the provider wait without polling or resubmitting', async () => {
    const controller = new AbortController()
    const mockFetch = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        request_id: 'fal-1',
        status_url: 'https://queue.fal.run/status/fal-1',
        response_url: 'https://queue.fal.run/response/fal-1',
      })
    )
    vi.stubGlobal('fetch', mockFetch)

    const resultPromise = generateVideo(falaiInput(), {
      requestId: 'request-1',
      signal: controller.signal,
    })
    await vi.advanceTimersByTimeAsync(0)
    controller.abort(new DOMException('cancelled', 'AbortError'))

    await expect(resultPromise).rejects.toMatchObject({ name: 'AbortError' })
    expect(mockFetch).toHaveBeenCalledTimes(1)
  })

  it('forwards cancellation to submission, polling, and download requests', async () => {
    const controller = new AbortController()
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          request_id: 'fal-1',
          status_url: 'https://queue.fal.run/status/fal-1',
          response_url: 'https://queue.fal.run/response/fal-1',
        })
      )
      .mockResolvedValueOnce(jsonResponse({ status: 'COMPLETED' }))
      .mockResolvedValueOnce(
        jsonResponse({
          video: { url: 'https://cdn.example/fal.mp4', width: 1920, height: 1080, duration: 8 },
        })
      )
      .mockResolvedValueOnce(new Response(Buffer.from('video')))
    vi.stubGlobal('fetch', mockFetch)

    const resultPromise = generateVideo(falaiInput(), {
      requestId: 'request-1',
      signal: controller.signal,
    })
    await vi.advanceTimersByTimeAsync(5000)
    await resultPromise

    for (const [, init] of mockFetch.mock.calls) {
      expect((init as RequestInit | undefined)?.signal).toBe(controller.signal)
    }
  })

  it('rejects a generated video whose declared size exceeds the 250 MiB cap', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          request_id: 'fal-1',
          status_url: 'https://queue.fal.run/status/fal-1',
          response_url: 'https://queue.fal.run/response/fal-1',
        })
      )
      .mockResolvedValueOnce(jsonResponse({ status: 'COMPLETED' }))
      .mockResolvedValueOnce(
        jsonResponse({
          video: { url: 'https://cdn.example/fal.mp4', width: 1920, height: 1080, duration: 8 },
        })
      )
      .mockResolvedValueOnce(
        new Response(Buffer.from('video'), {
          headers: { 'Content-Length': String(250 * 1024 * 1024 + 1) },
        })
      )
    vi.stubGlobal('fetch', mockFetch)

    const resultPromise = generateVideo(falaiInput(), { requestId: 'request-1' })
    const rejection = expect(resultPromise).rejects.toMatchObject({
      name: 'PayloadSizeLimitError',
    })
    await vi.advanceTimersByTimeAsync(5000)
    await rejection
  })

  it('times out after the execution deadline without resubmitting', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          request_id: 'fal-1',
          status_url: 'https://queue.fal.run/status/fal-1',
          response_url: 'https://queue.fal.run/response/fal-1',
        })
      )
      .mockResolvedValueOnce(jsonResponse({ status: 'IN_PROGRESS' }))
    vi.stubGlobal('fetch', mockFetch)

    const resultPromise = generateVideo(falaiInput(), { requestId: 'request-1' })
    const rejection = expect(resultPromise).rejects.toThrow('Fal.ai generation timed out')
    await vi.advanceTimersByTimeAsync(5000)
    await rejection
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})

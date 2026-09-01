/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  consumeGenerativeAppActionSse,
  streamingContentState,
} from '@/lib/arena-generative-ui/consume-action-sse'
import { encodeSSE } from '@/lib/core/utils/sse'

function sseResponse(events: unknown[]): Response {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const event of events) {
          controller.enqueue(encodeSSE(event))
        }
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'text/event-stream' } }
  )
}

describe('consumeGenerativeAppActionSse', () => {
  it('accumulates content after two chunks and returns navigate only on done', async () => {
    const accumulated: string[] = []
    const result = await consumeGenerativeAppActionSse(
      sseResponse([
        { type: 'chunk', content: 'Hel' },
        { type: 'chunk', content: 'lo' },
        {
          type: 'done',
          ok: true,
          navigate: 'results',
          setState: { content: 'Hello' },
        },
      ]),
      {
        onChunk: (text) => {
          accumulated.push(text)
        },
      }
    )

    expect(accumulated).toEqual(['Hel', 'Hello'])
    expect(result.ok).toBe(true)
    expect(result.navigate).toBe('results')
    expect(result.setState).toEqual({ content: 'Hello' })
  })

  it('does not treat a missing done event as success', async () => {
    const result = await consumeGenerativeAppActionSse(
      sseResponse([{ type: 'chunk', content: 'partial' }]),
      { onChunk: () => undefined }
    )
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/done event/i)
    expect(result.navigate).toBeUndefined()
  })
})

describe('streamingContentState', () => {
  it('writes accumulated tokens to content and the last-assistant sentinel', () => {
    expect(streamingContentState('Hello')).toEqual({
      content: 'Hello',
      __chatLastAssistant: 'Hello',
    })
  })
})

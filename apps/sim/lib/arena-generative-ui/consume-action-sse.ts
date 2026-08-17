import type { RunDeployedAppActionResult } from '@/lib/arena-generative-ui/run-action'
import { ARENA_GENERATIVE_STREAM_CONTENT_KEY } from '@/lib/arena-generative-ui/types'
import { readSSEEvents } from '@/lib/core/utils/sse'

export type ArenaGenerativeActionSseEvent =
  | { type: 'chunk'; content: string }
  | {
      type: 'done'
      ok: boolean
      data?: unknown
      navigate?: string
      setState?: Record<string, unknown>
      error?: string
    }

/**
 * Host state patch while CTA tokens arrive. DataText should use statePath `content`.
 */
export function streamingContentState(accumulated: string): Record<string, unknown> {
  return {
    [ARENA_GENERATIVE_STREAM_CONTENT_KEY]: accumulated,
  }
}

/**
 * Reads a GUI-app action SSE body: merge chunks, return the `done` payload.
 */
export async function consumeGenerativeAppActionSse(
  source: Response,
  options: {
    onChunk: (accumulated: string) => void
    signal?: AbortSignal
  }
): Promise<RunDeployedAppActionResult> {
  let accumulated = ''
  let done: RunDeployedAppActionResult | null = null

  await readSSEEvents<ArenaGenerativeActionSseEvent>(source, {
    signal: options.signal,
    onEvent: (event) => {
      if (event.type === 'chunk' && event.content) {
        accumulated += event.content
        options.onChunk(accumulated)
        return
      }
      if (event.type === 'done') {
        done = {
          ok: event.ok,
          data: event.data,
          navigate: event.navigate,
          setState: event.setState,
          error: event.error,
        }
        return true
      }
    },
  })

  if (!done) {
    return { ok: false, error: 'Stream ended without a done event' }
  }
  return done
}

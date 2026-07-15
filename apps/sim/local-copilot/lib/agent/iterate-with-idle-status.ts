import { emitIdleStatusHeartbeats } from '@/local-copilot/lib/agent/status-heartbeat'

export type IdleStatusMergeEvent<T> =
  | { type: 'status'; message: string }
  | { type: 'item'; item: T }

/**
 * Interleaves idle status heartbeats with an async source until the first
 * source item arrives (then heartbeats stop).
 */
export async function* iterateWithIdleStatus<T>(options: {
  source: AsyncIterable<T>
  abortSignal?: AbortSignal
  messages: readonly string[]
  idleMs?: number
  intervalMs?: number
}): AsyncGenerator<IdleStatusMergeEvent<T>, void, undefined> {
  const idleController = new AbortController()
  const onParentAbort = () => idleController.abort()
  options.abortSignal?.addEventListener('abort', onParentAbort, { once: true })

  const idleGen = emitIdleStatusHeartbeats({
    abortSignal: idleController.signal,
    messages: options.messages,
    idleMs: options.idleMs,
    intervalMs: options.intervalMs,
  })

  const sourceIter = options.source[Symbol.asyncIterator]()
  let nextItem = sourceIter.next()
  let nextIdle: Promise<IteratorResult<{ type: 'status'; message: string }>> = idleGen.next()
  let sourceDone = false
  let sawSourceItem = false

  try {
    while (!sourceDone) {
      if (options.abortSignal?.aborted) break

      const winner = await Promise.race([
        nextItem.then((result) => ({ side: 'source' as const, result })),
        nextIdle.then((result) => ({ side: 'idle' as const, result })),
      ])

      if (winner.side === 'idle') {
        if (!sawSourceItem && !winner.result.done && winner.result.value) {
          yield winner.result.value
        }
        nextIdle = winner.result.done
          ? new Promise<IteratorResult<{ type: 'status'; message: string }>>(() => {})
          : idleGen.next()
        continue
      }

      if (!sawSourceItem) {
        sawSourceItem = true
        idleController.abort()
      }

      if (winner.result.done) {
        sourceDone = true
        break
      }

      yield { type: 'item', item: winner.result.value }
      nextItem = sourceIter.next()
    }
  } finally {
    idleController.abort()
    options.abortSignal?.removeEventListener('abort', onParentAbort)
    await idleGen.return?.(undefined)
  }
}

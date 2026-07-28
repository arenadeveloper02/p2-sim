import { sleep } from '@sim/utils/helpers'

async function sleepUntilAbort(ms: number, abortSignal?: AbortSignal): Promise<'ok' | 'aborted'> {
  if (abortSignal?.aborted) return 'aborted'
  if (ms <= 0) return abortSignal?.aborted ? 'aborted' : 'ok'

  if (!abortSignal) {
    await sleep(ms)
    return 'ok'
  }

  let onAbort: (() => void) | undefined
  try {
    await Promise.race([
      sleep(ms),
      new Promise<void>((resolve) => {
        onAbort = () => resolve()
        abortSignal.addEventListener('abort', onAbort, { once: true })
      }),
    ])
  } finally {
    if (onAbort) {
      abortSignal.removeEventListener('abort', onAbort)
    }
  }

  return abortSignal.aborted ? 'aborted' : 'ok'
}

export type IdleStatusMergeEvent<T> =
  | { type: 'status'; message: string }
  | { type: 'item'; item: T }

/**
 * Interleaves rotating status messages with an async source.
 *
 * Starts with fallback copy, then swaps to a cheap-model engagement batch as soon
 * as it arrives (immediate status yield — does not wait for the next interval).
 */
export async function* iterateWithIdleStatus<T>(options: {
  source: AsyncIterable<T>
  abortSignal?: AbortSignal
  messages: readonly string[]
  /** Kept for callers; first status is always immediate. */
  idleMs?: number
  /** Delay between status lines while the source is quiet. */
  intervalMs?: number
  enrichMessages?: (abortSignal: AbortSignal) => Promise<readonly string[] | null>
}): AsyncGenerator<IdleStatusMergeEvent<T>, void, undefined> {
  const { abortSignal } = options
  const intervalMs = options.intervalMs ?? 4000

  let messages = options.messages.filter((message) => message.trim().length > 0)
  if (messages.length === 0) {
    for await (const item of options.source) {
      if (abortSignal?.aborted) return
      yield { type: 'item', item }
    }
    return
  }

  const enrichController = new AbortController()
  const onParentAbort = () => enrichController.abort()
  abortSignal?.addEventListener('abort', onParentAbort, { once: true })

  let index = 0
  let pendingAiBatch: string[] | null = null
  let aiReadyResolve: (() => void) | undefined
  const aiReady = new Promise<void>((resolve) => {
    aiReadyResolve = resolve
  })
  let aiConsumed = !options.enrichMessages

  if (options.enrichMessages) {
    void options
      .enrichMessages(enrichController.signal)
      .then((next) => {
        if (next && next.length > 0) {
          pendingAiBatch = [...next]
        }
        aiReadyResolve?.()
      })
      .catch(() => {
        aiReadyResolve?.()
      })
  } else {
    aiReadyResolve?.()
  }

  // Immediate fallback line so the chat never falls back to “Thinking…”.
  yield { type: 'status', message: messages[index % messages.length]! }
  index += 1

  const sourceIter = options.source[Symbol.asyncIterator]()
  let nextItem = sourceIter.next()
  let gapController = new AbortController()

  const restartGap = () => {
    gapController.abort()
    gapController = new AbortController()
    const onAbort = () => gapController.abort()
    abortSignal?.addEventListener('abort', onAbort, { once: true })
    const signal = gapController.signal
    const clearParent = () => abortSignal?.removeEventListener('abort', onAbort)
    return sleepUntilAbort(intervalMs, signal).finally(clearParent)
  }

  let nextGap = restartGap()

  try {
    while (!abortSignal?.aborted) {
      const winner = await Promise.race([
        nextItem.then((result) => ({ side: 'source' as const, result })),
        nextGap.then((result) => ({ side: 'idle' as const, result })),
        !aiConsumed
          ? aiReady.then(() => ({ side: 'ai' as const }))
          : new Promise<'never'>(() => {}),
      ])

      if (winner === 'never') continue

      if (winner.side === 'ai') {
        aiConsumed = true
        if (!pendingAiBatch || pendingAiBatch.length === 0) continue
        messages = pendingAiBatch
        index = 0
        gapController.abort()
        yield { type: 'status', message: messages[index % messages.length]! }
        index += 1
        nextGap = restartGap()
        continue
      }

      if (winner.side === 'idle') {
        if (winner.result === 'aborted' || abortSignal?.aborted) {
          if (abortSignal?.aborted) return
          continue
        }
        yield { type: 'status', message: messages[index % messages.length]! }
        index += 1
        nextGap = restartGap()
        continue
      }

      gapController.abort()

      if (winner.result.done) return

      yield { type: 'item', item: winner.result.value }
      nextItem = sourceIter.next()
      nextGap = restartGap()
    }
  } finally {
    gapController.abort()
    enrichController.abort()
    abortSignal?.removeEventListener('abort', onParentAbort)
  }
}

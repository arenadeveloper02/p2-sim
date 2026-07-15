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

/**
 * Yields rotating status messages after an idle threshold, then on an interval.
 * Stops when aborted or when the consumer closes the generator.
 */
export async function* emitIdleStatusHeartbeats(options: {
  abortSignal?: AbortSignal
  idleMs?: number
  intervalMs?: number
  messages: readonly string[]
}): AsyncGenerator<{ type: 'status'; message: string }, void, undefined> {
  const { abortSignal, messages } = options
  const idleMs = options.idleMs ?? 4000
  const intervalMs = options.intervalMs ?? 8000

  if (messages.length === 0) return

  if ((await sleepUntilAbort(idleMs, abortSignal)) === 'aborted') return

  let index = 0
  while (!abortSignal?.aborted) {
    yield { type: 'status', message: messages[index]! }
    index = (index + 1) % messages.length
    if ((await sleepUntilAbort(intervalMs, abortSignal)) === 'aborted') return
  }
}

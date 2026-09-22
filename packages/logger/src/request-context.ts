export interface RequestContext {
  requestId: string
  method?: string
  path?: string
}

/**
 * AsyncLocalStorage is only available in Node.js. In Edge/browser contexts
 * we fall back to a no-op implementation so the logger import doesn't break.
 */
interface Storage<T> {
  getStore(): T | undefined
  run<R>(store: T, fn: () => R): R
}

function createNoopStorage(): Storage<RequestContext> {
  return {
    getStore: () => undefined,
    run: <R>(_store: RequestContext, fn: () => R) => fn(),
  }
}

function loadNodeStorage(): Storage<RequestContext> | null {
  if (typeof globalThis.process === 'undefined' || !globalThis.process.versions?.node) {
    return null
  }

  try {
    /**
     * Build the specifier at runtime. A static `node:async_hooks` string —
     * even behind `webpackIgnore` or `typeof import('node:async_hooks')` —
     * is still followed by webpack's client compiler (UnhandledSchemeError).
     */
    const specifier = ['node', 'async_hooks'].join(':')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const hooks = require(/* webpackIgnore: true */ specifier) as {
      AsyncLocalStorage: new <T>() => Storage<T>
    }
    return new hooks.AsyncLocalStorage<RequestContext>()
  } catch {
    return null
  }
}

const storage = loadNodeStorage() ?? createNoopStorage()

/**
 * Runs a callback within a request context. All loggers called inside
 * the callback (and any async functions it awaits) will automatically
 * include the request context metadata in their output.
 */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn)
}

/**
 * Returns the current request context, or undefined if called outside
 * of a `runWithRequestContext` scope.
 */
export function getRequestContext(): RequestContext | undefined {
  return storage.getStore()
}

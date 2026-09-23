export interface RequestContext {
  requestId: string
  method?: string
  path?: string
}

interface Storage<T> {
  getStore(): T | undefined
  run<R>(store: T, fn: () => R): R
}

const noopStorage: Storage<RequestContext> = {
  getStore: () => undefined,
  run: <R>(_store: RequestContext, fn: () => R) => fn(),
}

/**
 * Shared holder so the Node installer can swap in AsyncLocalStorage without
 * this module ever mentioning `node:async_hooks`. The client logger stays a
 * no-op; server entrypoints import `@sim/logger/request-context.node`.
 */
export const requestContextStorage: { current: Storage<RequestContext> } = {
  current: noopStorage,
}

/**
 * Runs a callback within a request context. All loggers called inside
 * the callback (and any async functions it awaits) will automatically
 * include the request context metadata in their output.
 */
export function runWithRequestContext<T>(context: RequestContext, fn: () => T): T {
  return requestContextStorage.current.run(context, fn)
}

/**
 * Returns the current request context, or undefined if called outside
 * of a `runWithRequestContext` scope.
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContextStorage.current.getStore()
}

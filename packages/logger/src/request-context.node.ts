import { AsyncLocalStorage } from 'node:async_hooks'
import { requestContextStorage } from './request-context'

/**
 * Installs Node AsyncLocalStorage for request-scoped log metadata.
 * Import only from server entrypoints — this file is not client-safe.
 */
export function installNodeRequestContext(): void {
  requestContextStorage.current = new AsyncLocalStorage()
}

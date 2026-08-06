/**
 * Minimal isolate-side shim run at the top of every bundle entry.
 *
 * Must execute BEFORE `process/browser` because that shim captures
 * `setTimeout` at module-init time. Timers themselves are installed by
 * `isolated-vm-worker.cjs` (delegated to Node's real timers via
 * `ivm.Reference` per laverdet/isolated-vm#136) BEFORE the bundle runs, so
 * `process/browser` picks up the real delegated `setTimeout`.
 *
 * The only things this file still does:
 * - alias `global -> globalThis` for UMD-style fallbacks inside the bundles
 * - define `__require` so Bun's IIFE leftover for optional CJS deps (e.g. the
 *   `docx` package's optional `stream` import) does not throw
 *   `ReferenceError: __require is not defined` during Document construction
 *
 * All other runtime surface (`console`, `TextEncoder`, `TextDecoder`, timers)
 * is installed by the worker via `ivm.Callback` / `ivm.Reference` bridges to
 * Node's native implementations — no hand-rolled polyfill logic lives in the
 * isolate.
 */

const g: typeof globalThis & {
  global?: typeof globalThis
  __require?: (id: string) => unknown
} = globalThis

if (typeof g.global === 'undefined') g.global = globalThis

/**
 * Bun's browser IIFE emit leaves a free `__require` for optional Node builtins
 * that were not fully inlined. Optional deps (like `stream` in `docx`) catch
 * the throw; the critical part is that the free variable must resolve.
 */
if (typeof g.__require !== 'function') {
  g.__require = (id: string): never => {
    throw new Error(`Module "${id}" is not available in the document sandbox`)
  }
}

export {}

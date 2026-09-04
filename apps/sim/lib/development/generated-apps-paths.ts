import { join, resolve } from 'path'

export const GENERATED_APPS_DIR = 'generated-apps'

/**
 * turbopackIgnore: an unscoped `process.cwd()` (or walking parents with
 * `existsSync` / `dirname`) makes node-file-tracing sweep the whole project —
 * including `next.config.ts` — into every development API route graph.
 * Keep all generated-app paths under cwd + `generated-apps/` (same pattern as
 * `lib/uploads/core/setup.server.ts`).
 */
const PROJECT_ROOT = resolve(/*turbopackIgnore: true*/ process.cwd())

/**
 * Workspace root for Development block filesystem I/O.
 * Always `process.cwd()` — never walks parent directories (NFT whole-project trace).
 */
export function findMonorepoRoot(): string {
  return PROJECT_ROOT
}

/**
 * Absolute path to the `generated-apps` directory under the workspace root.
 */
export function getGeneratedAppsDir(): string {
  return join(/*turbopackIgnore: true*/ PROJECT_ROOT, GENERATED_APPS_DIR)
}

/**
 * Absolute path to a single generated app under `generated-apps/<repoName>`.
 */
export function getGeneratedAppDir(repoName: string): string {
  return join(/*turbopackIgnore: true*/ getGeneratedAppsDir(), repoName)
}

/**
 * Join a generated-app directory with a relative path. Ignore both sides so
 * NFT cannot treat pinned names (`next.config.ts`, `package.json`) as this
 * app's files — that emits colliding `[root-of-the-server]` chunks.
 */
export function joinGeneratedAppFsPath(rootDir: string, relativePath: string): string {
  return join(/* turbopackIgnore: true */ rootDir, /* turbopackIgnore: true */ relativePath)
}

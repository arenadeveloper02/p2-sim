import type { GeneratedAppFile } from '@/lib/development/normalize-generated-app-files'

const TRUNCATION_MARKERS = ['…(truncated)', '...(truncated)']

export function normalizeGeneratedAppPath(path: string): string {
  return path.replace(/\\/g, '/')
}

export function isTruncatedGeneratedFileContent(content: string): boolean {
  return TRUNCATION_MARKERS.some((marker) => content.includes(marker))
}

export function collectGeneratedAppRoutePaths(files: Array<{ path: string }>): string[] {
  return files
    .map((file) => normalizeGeneratedAppPath(file.path))
    .filter(
      (path) =>
        /(^|\/)app\/.+\/page\.tsx$/.test(path) ||
        /(^|\/)app\/api\/.+\/route\.ts$/.test(path) ||
        /(^|\/)src\/app\/.+\/page\.tsx$/.test(path) ||
        /(^|\/)src\/app\/api\/.+\/route\.ts$/.test(path)
    )
    .sort()
}

export function findTruncatedGeneratedAppFiles(files: GeneratedAppFile[]): string[] {
  return files
    .filter((file) => isTruncatedGeneratedFileContent(file.content))
    .map((file) => normalizeGeneratedAppPath(file.path))
}

export function findMissingGeneratedAppPaths(
  expectedPaths: string[],
  files: Array<{ path: string }>
): string[] {
  const have = new Set(files.map((file) => normalizeGeneratedAppPath(file.path)))
  return expectedPaths
    .map((path) => normalizeGeneratedAppPath(path))
    .filter((path) => path.length > 0 && !have.has(path))
}

/**
 * Fails the generate/edit deploy before GitHub push when the emitter silently
 * dropped routes or wrote budget-truncated file contents.
 */
export function assertGeneratedAppReadyToPush(params: {
  files: GeneratedAppFile[]
  baselinePaths?: string[]
  expectedPaths?: string[]
}): void {
  const truncated = findTruncatedGeneratedAppFiles(params.files)
  if (truncated.length > 0) {
    throw new Error(
      `Generated app contains truncated file contents and cannot be pushed: ${truncated.slice(0, 12).join(', ')}`
    )
  }

  const missingExpected = params.expectedPaths
    ? findMissingGeneratedAppPaths(params.expectedPaths, params.files)
    : []
  if (missingExpected.length > 0) {
    throw new Error(
      `Generated app is missing ${missingExpected.length} manifest file(s) and cannot be pushed: ${missingExpected.slice(0, 15).join(', ')}`
    )
  }

  if (!params.baselinePaths?.length) {
    return
  }

  const baselineRoutes = collectGeneratedAppRoutePaths(
    params.baselinePaths.map((path) => ({ path }))
  )
  const nextRoutes = collectGeneratedAppRoutePaths(params.files)
  const nextRouteSet = new Set(nextRoutes)
  const droppedRoutes = baselineRoutes.filter((path) => !nextRouteSet.has(path))
  if (droppedRoutes.length > 0) {
    throw new Error(
      `Generated app would drop ${droppedRoutes.length} route file(s) (${baselineRoutes.length} → ${nextRoutes.length}): ${droppedRoutes.slice(0, 15).join(', ')}. Refusing to push an incomplete app.`
    )
  }

  if (params.files.length < Math.floor(params.baselinePaths.length * 0.6)) {
    throw new Error(
      `Generated app file count dropped from ${params.baselinePaths.length} to ${params.files.length} before push. Refusing to push an incomplete app.`
    )
  }
}

import { existsSync } from 'fs'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import {
  ARENA_LEGACY_MIDDLEWARE_PATHS,
  shipsArenaProxyFile,
} from '@/lib/development/arena/scaffold'
import { isTruncatedGeneratedFileContent } from '@/lib/development/assert-generated-app-completeness'
import type { GeneratedAppFile } from '@/lib/development/nextjs-app-generator'
import { sanitizeRelativeFilePath } from '@/lib/development/nextjs-app-generator'

const logger = createLogger('ReadGeneratedAppFiles')

const SKIP_DIR_NAMES = new Set([
  '.git',
  '.next',
  'node_modules',
  'dist',
  'coverage',
  '.vercel',
  '.turbo',
])

const INCLUDED_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.json',
  '.md',
  '.env.example',
])

const MAX_TOTAL_CHARS = 200_000
const MAX_FILE_CHARS = 24_000

/**
 * Always read these first so edit/E2B validation cannot drop tsconfig.json (or
 * other scaffolding) when the 200k char budget is spent on app/components first.
 */
const PINNED_SOURCE_PATHS = [
  'package.json',
  'tsconfig.json',
  'next.config.ts',
  'next-env.d.ts',
  'prisma/schema.prisma',
  'lib/prisma.ts',
  'lib/actions.ts',
  'lib/types.ts',
  'app/layout.tsx',
  'app/page.tsx',
  'REPO_SUMMARY.md',
] as const

function shouldIncludeFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, '/')
  const segments = normalized.split('/')
  if (segments.some((segment) => SKIP_DIR_NAMES.has(segment))) {
    return false
  }

  const dotIndex = normalized.lastIndexOf('.')
  if (dotIndex < 0) {
    return normalized.endsWith('.env.example')
  }

  const extension = normalized.slice(dotIndex)
  return INCLUDED_EXTENSIONS.has(extension)
}

function pushFileIfBudgetAllows(
  files: GeneratedAppFile[],
  totalChars: { value: number },
  seenPaths: Set<string>,
  relativePath: string,
  content: string
): void {
  const safePath = sanitizeRelativeFilePath(relativePath)
  if (!safePath) {
    return
  }

  const normalized = safePath.replace(/\\/g, '/')
  if (seenPaths.has(normalized)) {
    return
  }

  let nextContent = content
  if (nextContent.length > MAX_FILE_CHARS) {
    nextContent = `${nextContent.slice(0, MAX_FILE_CHARS)}\n…(truncated)`
  }

  const remaining = MAX_TOTAL_CHARS - totalChars.value
  if (remaining <= 0) {
    return
  }
  if (nextContent.length > remaining) {
    nextContent = `${nextContent.slice(0, remaining)}\n…(truncated)`
  }

  files.push({ path: safePath, content: nextContent })
  seenPaths.add(normalized)
  totalChars.value += nextContent.length
}

async function walkDirectory(
  rootDir: string,
  currentDir: string,
  files: GeneratedAppFile[],
  totalChars: { value: number },
  seenPaths: Set<string>
): Promise<void> {
  if (totalChars.value >= MAX_TOTAL_CHARS) {
    return
  }

  const entries = await readdir(currentDir, { withFileTypes: true })

  for (const entry of entries) {
    if (totalChars.value >= MAX_TOTAL_CHARS) {
      break
    }

    const absolutePath = join(currentDir, entry.name)
    const relativePath = absolutePath.slice(rootDir.length + 1)

    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) {
        continue
      }
      await walkDirectory(rootDir, absolutePath, files, totalChars, seenPaths)
      continue
    }

    if (!entry.isFile() || !shouldIncludeFile(relativePath)) {
      continue
    }

    try {
      const content = await readFile(absolutePath, 'utf-8')
      pushFileIfBudgetAllows(files, totalChars, seenPaths, relativePath, content)
    } catch (error) {
      logger.warn('Skipping unreadable generated app file', {
        path: relativePath,
        error: toError(error).message,
      })
    }
  }
}

/**
 * Reads source files from a generated app directory for LLM edit context.
 */
export async function readGeneratedAppFiles(outputDir: string): Promise<GeneratedAppFile[]> {
  if (!existsSync(outputDir)) {
    throw new Error(`Generated app directory does not exist: ${outputDir}`)
  }

  const files: GeneratedAppFile[] = []
  const totalChars = { value: 0 }
  const seenPaths = new Set<string>()

  for (const relativePath of PINNED_SOURCE_PATHS) {
    const absolutePath = join(outputDir, relativePath)
    if (!existsSync(absolutePath)) {
      continue
    }
    try {
      const content = await readFile(absolutePath, 'utf-8')
      pushFileIfBudgetAllows(files, totalChars, seenPaths, relativePath, content)
    } catch (error) {
      logger.warn('Skipping unreadable generated app file', {
        path: relativePath,
        error: toError(error).message,
      })
    }
  }

  await walkDirectory(outputDir, outputDir, files, totalChars, seenPaths)

  if (files.length === 0) {
    throw new Error('No readable source files found in the selected repository')
  }

  return files
}

async function walkGeneratedAppSourcePaths(
  rootDir: string,
  currentDir: string,
  paths: string[]
): Promise<void> {
  const entries = await readdir(currentDir, { withFileTypes: true })

  for (const entry of entries) {
    const absolutePath = join(currentDir, entry.name)
    const relativePath = absolutePath.slice(rootDir.length + 1).replace(/\\/g, '/')

    if (entry.isDirectory()) {
      if (SKIP_DIR_NAMES.has(entry.name)) {
        continue
      }
      await walkGeneratedAppSourcePaths(rootDir, absolutePath, paths)
      continue
    }

    if (!entry.isFile() || !shouldIncludeFile(relativePath)) {
      continue
    }

    const safePath = sanitizeRelativeFilePath(relativePath)
    if (safePath) {
      paths.push(safePath.replace(/\\/g, '/'))
    }
  }
}

/** Lists every source path on disk without the LLM char budget. */
export async function listGeneratedAppSourcePaths(outputDir: string): Promise<string[]> {
  if (!existsSync(outputDir)) {
    throw new Error(`Generated app directory does not exist: ${outputDir}`)
  }

  const paths: string[] = []
  await walkGeneratedAppSourcePaths(outputDir, outputDir, paths)
  return [...new Set(paths)].sort()
}

async function readUntruncatedGeneratedAppFile(
  outputDir: string,
  relativePath: string
): Promise<GeneratedAppFile | null> {
  const safePath = sanitizeRelativeFilePath(relativePath)
  if (!safePath) {
    return null
  }

  const absolutePath = join(outputDir, safePath)
  if (!existsSync(absolutePath)) {
    return null
  }

  const content = await readFile(absolutePath, 'utf-8')
  return { path: safePath.replace(/\\/g, '/'), content }
}

/**
 * Puts omitted or budget-truncated files back from disk so an edit cannot
 * silently rewrite two-thirds of the app.
 */
export async function restoreOmittedGeneratedAppFiles(
  outputDir: string,
  files: GeneratedAppFile[],
  baselinePaths?: string[]
): Promise<GeneratedAppFile[]> {
  const diskPaths = baselinePaths ?? (await listGeneratedAppSourcePaths(outputDir))
  const byPath = new Map<string, GeneratedAppFile>()

  // Next.js 16 hard-errors when middleware.ts and proxy.ts coexist, so a
  // pre-proxy middleware.ts left on disk must never be restored alongside the
  // Arena proxy scaffold.
  const dropLegacyMiddleware = shipsArenaProxyFile(files)
  const legacyMiddlewarePaths = new Set<string>(ARENA_LEGACY_MIDDLEWARE_PATHS)

  for (const file of files) {
    const path = file.path.replace(/\\/g, '/')
    if (dropLegacyMiddleware && legacyMiddlewarePaths.has(path)) {
      continue
    }
    if (isTruncatedGeneratedFileContent(file.content)) {
      const restored = await readUntruncatedGeneratedAppFile(outputDir, path)
      if (!restored) {
        throw new Error(`Generated file ${path} is truncated and has no complete copy on disk`)
      }
      byPath.set(path, restored)
      continue
    }
    byPath.set(path, { ...file, path })
  }

  for (const path of diskPaths) {
    if (byPath.has(path)) {
      continue
    }
    if (dropLegacyMiddleware && legacyMiddlewarePaths.has(path)) {
      continue
    }
    const restored = await readUntruncatedGeneratedAppFile(outputDir, path)
    if (restored) {
      byPath.set(path, restored)
    }
  }

  return [...byPath.values()]
}

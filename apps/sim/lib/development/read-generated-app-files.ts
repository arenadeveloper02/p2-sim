import { existsSync } from 'fs'
import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
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

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'fs'
import { join, normalize } from 'path'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { env } from '@/lib/core/config/env'
import { executeShellInE2B, type SandboxFile } from '@/lib/execution/e2b'

function sanitizeRelativeFilePath(filePath: string): string | null {
  const normalized = normalize(filePath.replace(/\\/g, '/'))
  if (normalized.startsWith('..') || normalized.startsWith('/')) {
    return null
  }
  return normalized
}

const logger = createLogger('ValidateGeneratedAppBuild')
const execFileAsync = promisify(execFile)

const BUILD_TIMEOUT_MS = 300_000
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm'

export interface GeneratedAppFile {
  path: string
  content: string
}

export interface ValidateAppBuildResult {
  validated: boolean
  output: string
  method: 'local' | 'e2b' | 'skipped'
}

export interface ValidateGeneratedAppBuildOptions {
  requiresDatabase?: boolean
}

const DUMMY_DATABASE_URL = 'postgresql://user:pass@localhost:5432/validate?sslmode=disable'
const NPM_INSTALL_ARGS = ['install', '--include=dev', '--no-audit', '--no-fund'] as const

function formatExecError(error: unknown): string {
  const err = error as { stdout?: string; stderr?: string; message?: string }
  return [err.stdout, err.stderr, err.message].filter(Boolean).join('\n')
}

async function runNpmInDir(
  outputDir: string,
  args: string[],
  envOverrides: Record<string, string | undefined> = {}
): Promise<string> {
  const { stdout, stderr } = await execFileAsync(NPM_CMD, args, {
    cwd: outputDir,
    encoding: 'utf-8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: BUILD_TIMEOUT_MS,
    env: { ...process.env, ...envOverrides },
  })
  return [stdout, stderr].filter(Boolean).join('\n')
}

async function validateAppTypecheckLocally(
  outputDir: string,
  options: ValidateGeneratedAppBuildOptions = {}
): Promise<ValidateAppBuildResult> {
  if (!existsSync(join(outputDir, 'package.json'))) {
    return {
      validated: false,
      output: 'Typecheck validation failed: package.json is missing from the generated app',
      method: 'local',
    }
  }

  const logs: string[] = []
  const databaseEnv = options.requiresDatabase
    ? { DATABASE_URL: process.env.DATABASE_URL ?? DUMMY_DATABASE_URL }
    : {}

  try {
    logger.info('Running local npm install for generated app typecheck', { outputDir })
    logs.push('=== npm install ===')
    logs.push(await runNpmInDir(outputDir, [...NPM_INSTALL_ARGS], databaseEnv))

    if (options.requiresDatabase && existsSync(join(outputDir, 'prisma/schema.prisma'))) {
      logger.info('Running prisma generate for generated app typecheck', { outputDir })
      logs.push('=== prisma generate ===')
      logs.push(await runNpmInDir(outputDir, ['exec', 'prisma', 'generate'], databaseEnv))
    }

    logger.info('Running TypeScript check for generated app', { outputDir })
    logs.push('=== tsc --noEmit ===')
    logs.push(await runNpmInDir(outputDir, ['exec', 'tsc', '--noEmit'], databaseEnv))

    return { validated: true, output: logs.join('\n'), method: 'local' }
  } catch (error) {
    logs.push(formatExecError(error))
    return { validated: false, output: logs.join('\n'), method: 'local' }
  }
}

async function validateAppBuildLocally(
  outputDir: string,
  options: ValidateGeneratedAppBuildOptions = {}
): Promise<ValidateAppBuildResult> {
  if (!existsSync(join(outputDir, 'package.json'))) {
    return {
      validated: false,
      output: 'Build validation failed: package.json is missing from the generated app',
      method: 'local',
    }
  }

  const logs: string[] = []
  const databaseEnv = options.requiresDatabase
    ? { DATABASE_URL: process.env.DATABASE_URL ?? DUMMY_DATABASE_URL }
    : {}

  try {
    logger.info('Running local npm install for generated app', { outputDir })
    logs.push('=== npm install ===')
    logs.push(await runNpmInDir(outputDir, [...NPM_INSTALL_ARGS], databaseEnv))

    logger.info('Running local npm run build for generated app', { outputDir })
    logs.push('=== npm run build ===')
    logs.push(await runNpmInDir(outputDir, ['run', 'build'], databaseEnv))

    return { validated: true, output: logs.join('\n'), method: 'local' }
  } catch (error) {
    logs.push(formatExecError(error))
    return { validated: false, output: logs.join('\n'), method: 'local' }
  }
}

async function validateAppTypecheckInE2b(
  files: GeneratedAppFile[],
  options: ValidateGeneratedAppBuildOptions = {}
): Promise<ValidateAppBuildResult> {
  const sandboxFiles: SandboxFile[] = files
    .map((file) => {
      const safePath = sanitizeRelativeFilePath(file.path)
      if (!safePath) return null
      return { path: `/home/user/app/${safePath}`, content: file.content }
    })
    .filter((entry): entry is SandboxFile => entry !== null)

  const hasPrisma = files.some((file) => file.path === 'prisma/schema.prisma')
  const shellScript = [
    'set -euo pipefail',
    'cd /home/user/app',
    options.requiresDatabase ? `export DATABASE_URL="${DUMMY_DATABASE_URL}"` : '',
    'npm install --include=dev --prefer-offline --no-audit --no-fund 2>&1',
    options.requiresDatabase && hasPrisma ? 'npx prisma generate 2>&1' : '',
    'npx tsc --noEmit 2>&1',
    'echo "__SIM_RESULT__={\\"typecheckOk\\":true}"',
  ]
    .filter(Boolean)
    .join('\n')

  const result = await executeShellInE2B({
    code: shellScript,
    envs: { NODE_ENV: 'development' },
    timeoutMs: BUILD_TIMEOUT_MS,
    sandboxFiles,
  })

  if (result.error) {
    return {
      validated: false,
      output: result.stdout || result.error,
      method: 'e2b',
    }
  }

  return { validated: true, output: result.stdout, method: 'e2b' }
}

async function validateAppBuildInE2b(
  files: GeneratedAppFile[],
  options: ValidateGeneratedAppBuildOptions = {}
): Promise<ValidateAppBuildResult> {
  const sandboxFiles: SandboxFile[] = files
    .map((file) => {
      const safePath = sanitizeRelativeFilePath(file.path)
      if (!safePath) return null
      return { path: `/home/user/app/${safePath}`, content: file.content }
    })
    .filter((entry): entry is SandboxFile => entry !== null)

  const shellScript = [
    'set -euo pipefail',
    'cd /home/user/app',
    options.requiresDatabase ? `export DATABASE_URL="${DUMMY_DATABASE_URL}"` : '',
    'npm install --include=dev --prefer-offline --no-audit --no-fund 2>&1',
    'npm run build 2>&1',
    'echo "__SIM_RESULT__={\\"buildOk\\":true}"',
  ]
    .filter(Boolean)
    .join('\n')

  const result = await executeShellInE2B({
    code: shellScript,
    envs: { NODE_ENV: 'development' },
    timeoutMs: BUILD_TIMEOUT_MS,
    sandboxFiles,
  })

  if (result.error) {
    return {
      validated: false,
      output: result.stdout || result.error,
      method: 'e2b',
    }
  }

  return { validated: true, output: result.stdout, method: 'e2b' }
}

/**
 * Runs npm install, prisma generate (when needed), and tsc --noEmit to catch TypeScript errors
 * before deploy. Prefers E2B when configured; otherwise validates in the local output directory.
 */
export async function validateGeneratedAppTypecheck(
  outputDir: string,
  files: GeneratedAppFile[],
  options: ValidateGeneratedAppBuildOptions = {}
): Promise<ValidateAppBuildResult> {
  if (env.E2B_API_KEY) {
    logger.info('Validating generated app TypeScript in E2B')
    return validateAppTypecheckInE2b(files, options)
  }

  try {
    return await validateAppTypecheckLocally(outputDir, options)
  } catch (error) {
    const message = toError(error).message
    return {
      validated: false,
      output: `Local typecheck validation failed: ${message}. Ensure Node.js and npm are installed.`,
      method: 'local',
    }
  }
}

/**
 * Runs npm install and npm run build to verify the generated Next.js app compiles.
 * Prefers E2B when configured; otherwise validates in the local output directory.
 */
export async function validateGeneratedAppBuild(
  outputDir: string,
  files: GeneratedAppFile[],
  options: ValidateGeneratedAppBuildOptions = {}
): Promise<ValidateAppBuildResult> {
  if (env.E2B_API_KEY) {
    logger.info('Validating generated app build in E2B')
    return validateAppBuildInE2b(files, options)
  }

  try {
    return await validateAppBuildLocally(outputDir, options)
  } catch (error) {
    const message = toError(error).message
    return {
      validated: false,
      output: `Local build validation failed: ${message}. Ensure Node.js and npm are installed.`,
      method: 'local',
    }
  }
}

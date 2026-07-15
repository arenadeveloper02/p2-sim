import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'fs'
import { join, normalize } from 'path'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { env } from '@/lib/core/config/env'
import { isProd } from '@/lib/core/config/env-flags'
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

const TYPECHECK_TIMEOUT_MS = 300_000
const FULL_BUILD_TIMEOUT_MS = 600_000
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm'

export interface GeneratedAppFile {
  path: string
  content: string
}

/**
 * Maps generated app files into E2B sandbox mounts, dropping unsafe relative paths.
 */
function toSandboxFiles(files: GeneratedAppFile[]): SandboxFile[] {
  const sandboxFiles: SandboxFile[] = []
  for (const file of files) {
    const safePath = sanitizeRelativeFilePath(file.path)
    if (!safePath) continue
    sandboxFiles.push({ path: `/home/user/app/${safePath}`, content: file.content })
  }
  return sandboxFiles
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
const NPM_INSTALL_ARGS = [
  'install',
  '--include=dev',
  '--legacy-peer-deps',
  '--no-audit',
  '--no-fund',
] as const

/**
 * NODE_ENV must be 'production' (never 'development'): `next build` under a
 * non-standard NODE_ENV fails /404 prerender with a misleading
 * "<Html> should not be imported outside of pages/_document" error.
 * Dev dependencies still install because npm runs with --include=dev.
 */
const E2B_VALIDATION_ENV = {
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
  PRISMA_HIDE_UPDATE_MESSAGE: 'true',
  CI: '1',
} as const

function buildE2bValidationShellScript(lines: string[]): string {
  return [
    'set -euo pipefail',
    'cd /home/user/app',
    'export NEXT_TELEMETRY_DISABLED=1',
    'export PRISMA_HIDE_UPDATE_MESSAGE=true',
    'export CI=1',
    ...lines,
  ]
    .filter(Boolean)
    .join('\n')
}

function shouldSkipPackageBuildScript(
  options: ValidateGeneratedAppBuildOptions,
  hasPrisma: boolean
): boolean {
  /** package.json build runs prisma db push — only valid on Vercel/Neon, not in E2B or local sandbox validation */
  return options.requiresDatabase === true && hasPrisma
}

/**
 * In production, generated-app validation must run in an isolated E2B sandbox.
 * The local fallback shells out to `npm install` / `tsc` / `next build`, which
 * spawns multi-GB, CPU-bound child processes inside the Sim server container —
 * starving the Node event loop until the `/api/health` check times out and
 * Docker marks the container unhealthy. When E2B is not configured in prod we
 * skip validation instead (as `validateGeneratedAppProductionBuild` already
 * does) rather than run heavy builds in-process.
 */
function skipLocalValidationInProd(stage: string): ValidateAppBuildResult | null {
  if (!isProd) return null
  logger.warn(
    `Skipping local generated-app ${stage} in production: E2B_API_KEY not configured. ` +
      'Set E2B_API_KEY so validation runs in an isolated sandbox instead of the server container.'
  )
  return {
    validated: true,
    output: `Skipped ${stage} validation (E2B not configured in production)`,
    method: 'skipped',
  }
}

function formatExecError(error: unknown): string {
  const err = error as { stdout?: string; stderr?: string; message?: string }
  return [err.stdout, err.stderr, err.message].filter(Boolean).join('\n')
}

async function runNpmInDir(
  outputDir: string,
  args: string[],
  envOverrides: Record<string, string | undefined> = {},
  timeoutMs: number = TYPECHECK_TIMEOUT_MS
): Promise<string> {
  const { stdout, stderr } = await execFileAsync(NPM_CMD, args, {
    cwd: outputDir,
    encoding: 'utf-8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: timeoutMs,
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
  const hasPrisma = existsSync(join(outputDir, 'prisma/schema.prisma'))
  const skipPackageBuild = shouldSkipPackageBuildScript(options, hasPrisma)

  try {
    logger.info('Running local npm install for generated app', { outputDir })
    logs.push('=== npm install ===')
    logs.push(
      await runNpmInDir(outputDir, [...NPM_INSTALL_ARGS], databaseEnv, FULL_BUILD_TIMEOUT_MS)
    )

    if (skipPackageBuild) {
      logger.info('Running prisma generate for generated app build validation', { outputDir })
      logs.push('=== prisma generate ===')
      logs.push(
        await runNpmInDir(
          outputDir,
          ['exec', 'prisma', 'generate'],
          databaseEnv,
          FULL_BUILD_TIMEOUT_MS
        )
      )
      logger.info('Running next build without prisma db push (validation only)', { outputDir })
      logs.push('=== next build ===')
      logs.push(
        await runNpmInDir(outputDir, ['exec', 'next', 'build'], databaseEnv, FULL_BUILD_TIMEOUT_MS)
      )
    } else {
      logger.info('Running local npm run build for generated app', { outputDir })
      logs.push('=== npm run build ===')
      logs.push(await runNpmInDir(outputDir, ['run', 'build'], databaseEnv, FULL_BUILD_TIMEOUT_MS))
    }

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
  const sandboxFiles = toSandboxFiles(files)

  const hasPrisma = files.some((file) => file.path === 'prisma/schema.prisma')
  const shellScript = buildE2bValidationShellScript([
    options.requiresDatabase ? `export DATABASE_URL="${DUMMY_DATABASE_URL}"` : '',
    'npm install --include=dev --legacy-peer-deps --prefer-offline --no-audit --no-fund 2>&1',
    options.requiresDatabase && hasPrisma ? 'npx prisma generate 2>&1' : '',
    'npx tsc --noEmit 2>&1',
    'echo "__SIM_RESULT__={\\"typecheckOk\\":true}"',
  ])

  const result = await executeShellInE2B({
    code: shellScript,
    envs: { ...E2B_VALIDATION_ENV },
    timeoutMs: TYPECHECK_TIMEOUT_MS,
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
  const sandboxFiles = toSandboxFiles(files)

  const hasPrisma = files.some((file) => file.path === 'prisma/schema.prisma')
  const skipPackageBuild = shouldSkipPackageBuildScript(options, hasPrisma)
  const compileStep = skipPackageBuild ? 'npx next build 2>&1' : 'npm run build 2>&1'
  const shellScript = buildE2bValidationShellScript([
    options.requiresDatabase ? `export DATABASE_URL="${DUMMY_DATABASE_URL}"` : '',
    'npm install --include=dev --legacy-peer-deps --prefer-offline --no-audit --no-fund 2>&1',
    skipPackageBuild ? 'npx prisma generate 2>&1' : '',
    compileStep,
    'echo "__SIM_RESULT__={\\"buildOk\\":true}"',
  ])

  const result = await executeShellInE2B({
    code: shellScript,
    envs: { ...E2B_VALIDATION_ENV },
    timeoutMs: FULL_BUILD_TIMEOUT_MS,
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

  const skipped = skipLocalValidationInProd('typecheck')
  if (skipped) return skipped

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

  const skipped = skipLocalValidationInProd('build')
  if (skipped) return skipped

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

/**
 * Fast pre-deploy validation used in repair loops: E2B typecheck or local tsc --noEmit.
 */
export async function validateGeneratedAppPreDeploy(
  outputDir: string,
  files: GeneratedAppFile[],
  options: ValidateGeneratedAppBuildOptions = {}
): Promise<ValidateAppBuildResult> {
  return validateGeneratedAppTypecheck(outputDir, files, options)
}

/**
 * Final production compile gate after fast typecheck passes: full next build in E2B when configured.
 */
export async function validateGeneratedAppProductionBuild(
  outputDir: string,
  files: GeneratedAppFile[],
  options: ValidateGeneratedAppBuildOptions = {}
): Promise<ValidateAppBuildResult> {
  if (env.E2B_API_KEY) {
    return validateGeneratedAppBuild(outputDir, files, options)
  }

  return { validated: true, output: 'Skipped final build (E2B not configured)', method: 'skipped' }
}

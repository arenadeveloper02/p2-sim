import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'fs'
import { join, normalize } from 'path'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { env } from '@/lib/core/config/env'
import { isProd } from '@/lib/core/config/env-flags'
import {
  DEFAULT_SHELL_SANDBOX_LIFETIME_MS,
  withShellSandbox,
  type SandboxFile,
  type ShellSandboxRunner,
} from '@/lib/execution/remote-sandbox'

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

/** App root inside the shell sandbox. */
const SANDBOX_APP_ROOT = '/home/user/app'

/**
 * Optional paths the E2B Function template can ship to warm installs:
 * - `/opt/sim/generated-app-npm-cache` — npm cache directory (packuments + tarballs)
 * - `/opt/sim/generated-app-node_modules` — baseline node_modules for pinned Next/React apps
 *
 * Bake these into the template via `e2b template build` (or equivalent) after
 * `npm install` of the pinned Next/React stack; sandboxes then seed from them.
 */
const TEMPLATE_NPM_CACHE = '/opt/sim/generated-app-npm-cache'
const TEMPLATE_NODE_MODULES = '/opt/sim/generated-app-node_modules'

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
    sandboxFiles.push({ path: `${SANDBOX_APP_ROOT}/${safePath}`, content: file.content })
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
    `cd ${SANDBOX_APP_ROOT}`,
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

function hashPackageJson(files: GeneratedAppFile[]): string {
  const pkg = files.find((file) => file.path.replace(/\\/g, '/') === 'package.json')
  return createHash('sha256')
    .update(pkg?.content ?? '')
    .digest('hex')
}

/**
 * npm install that prefers a template-baked cache / baseline node_modules when present.
 * Does not use --prefer-offline globally (stale packuments can ETARGET); the template
 * cache is only a seed — npm still resolves versions from the registry as needed.
 */
function buildNpmInstallScriptLines(): string[] {
  return [
    `if [ -d "${TEMPLATE_NPM_CACHE}" ]; then export npm_config_cache="${TEMPLATE_NPM_CACHE}"; else mkdir -p /home/user/.npm && export npm_config_cache=/home/user/.npm; fi`,
    `if [ ! -d node_modules ] && [ -d "${TEMPLATE_NODE_MODULES}" ]; then echo "Seeding node_modules from E2B template cache"; cp -a "${TEMPLATE_NODE_MODULES}" node_modules; fi`,
    'npm install --include=dev --legacy-peer-deps --no-audit --no-fund 2>&1',
  ]
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

/**
 * Long-lived E2B shell session: one sandbox for typecheck → repair → build.
 * Rematerializes source files between attempts; runs `npm install` only when
 * package.json changes (or on first attempt). Seeds from template caches when present.
 */
export class GeneratedAppE2bValidationSession {
  private packageJsonHash: string | null = null
  private hasNodeModules = false

  constructor(
    private readonly runner: ShellSandboxRunner,
    private readonly options: ValidateGeneratedAppBuildOptions = {}
  ) {}

  private async materializeFiles(files: GeneratedAppFile[]): Promise<void> {
    await this.runner.run(`mkdir -p ${SANDBOX_APP_ROOT}`, {
      envs: { ...E2B_VALIDATION_ENV },
      timeoutMs: 30_000,
    })
    const sandboxFiles = toSandboxFiles(files)
    for (const file of sandboxFiles) {
      if (!('content' in file) || file.content === undefined) continue
      await this.runner.writeFile(file.path, file.content)
    }
  }

  private async ensureDependencies(files: GeneratedAppFile[], timeoutMs: number): Promise<string> {
    const nextHash = hashPackageJson(files)
    if (this.hasNodeModules && this.packageJsonHash === nextHash) {
      logger.info('Reusing node_modules in E2B session (package.json unchanged)', {
        sandboxId: this.runner.sandboxId,
      })
      return '=== npm install (skipped — package.json unchanged) ===\n'
    }

    logger.info('Installing dependencies in E2B session', {
      sandboxId: this.runner.sandboxId,
      packageJsonChanged: this.packageJsonHash !== null && this.packageJsonHash !== nextHash,
      seededFromTemplateHint: `${TEMPLATE_NODE_MODULES} / ${TEMPLATE_NPM_CACHE}`,
    })

    const script = buildE2bValidationShellScript([
      this.options.requiresDatabase ? `export DATABASE_URL="${DUMMY_DATABASE_URL}"` : '',
      ...buildNpmInstallScriptLines(),
      'echo "__SIM_RESULT__={\\"installOk\\":true}"',
    ])

    const result = await this.runner.run(script, {
      envs: { ...E2B_VALIDATION_ENV },
      timeoutMs,
    })

    const stdout = [result.stdout, result.stderr].filter(Boolean).join('\n')
    if (result.exitCode !== 0) {
      this.hasNodeModules = false
      this.packageJsonHash = null
      throw new Error(stdout || `npm install exited with code ${result.exitCode}`)
    }

    this.hasNodeModules = true
    this.packageJsonHash = nextHash
    return `=== npm install ===\n${stdout}\n`
  }

  private async runPhase(
    files: GeneratedAppFile[],
    phase: 'typecheck' | 'build'
  ): Promise<ValidateAppBuildResult> {
    await this.materializeFiles(files)

    const hasPrisma = files.some((file) => file.path === 'prisma/schema.prisma')
    const timeoutMs = phase === 'typecheck' ? TYPECHECK_TIMEOUT_MS : FULL_BUILD_TIMEOUT_MS
    const logs: string[] = []

    try {
      logs.push(await this.ensureDependencies(files, timeoutMs))
    } catch (error) {
      return {
        validated: false,
        output: getErrorMessageFromUnknown(error),
        method: 'e2b',
      }
    }

    const phaseLines: string[] = [
      this.options.requiresDatabase ? `export DATABASE_URL="${DUMMY_DATABASE_URL}"` : '',
    ]

    if (phase === 'typecheck') {
      if (this.options.requiresDatabase && hasPrisma) {
        phaseLines.push('npx prisma generate 2>&1')
      }
      phaseLines.push('npx tsc --noEmit 2>&1')
      phaseLines.push('echo "__SIM_RESULT__={\\"typecheckOk\\":true}"')
    } else {
      const skipPackageBuild = shouldSkipPackageBuildScript(this.options, hasPrisma)
      if (skipPackageBuild) {
        phaseLines.push('npx prisma generate 2>&1')
        phaseLines.push('npx next build 2>&1')
      } else {
        phaseLines.push('npm run build 2>&1')
      }
      phaseLines.push('echo "__SIM_RESULT__={\\"buildOk\\":true}"')
    }

    const script = buildE2bValidationShellScript(phaseLines)
    const result = await this.runner.run(script, {
      envs: { ...E2B_VALIDATION_ENV },
      timeoutMs,
    })

    const stdout = [result.stdout, result.stderr].filter(Boolean).join('\n')
    logs.push(`=== ${phase} ===`, stdout)

    if (result.exitCode !== 0) {
      return { validated: false, output: logs.join('\n'), method: 'e2b' }
    }

    return { validated: true, output: logs.join('\n'), method: 'e2b' }
  }

  async typecheck(files: GeneratedAppFile[]): Promise<ValidateAppBuildResult> {
    logger.info('Validating generated app TypeScript in reused E2B session', {
      sandboxId: this.runner.sandboxId,
    })
    return this.runPhase(files, 'typecheck')
  }

  async build(files: GeneratedAppFile[]): Promise<ValidateAppBuildResult> {
    logger.info('Validating generated app build in reused E2B session', {
      sandboxId: this.runner.sandboxId,
    })
    return this.runPhase(files, 'build')
  }
}

function getErrorMessageFromUnknown(error: unknown): string {
  return toError(error).message
}

/**
 * Opens one E2B shell sandbox for the full validate/repair/build loop when
 * E2B_API_KEY is set. The session reuses node_modules across attempts.
 * When E2B is unset, invokes `fn(null)` so callers fall back to local/skip paths.
 */
export async function withGeneratedAppE2bValidationSession<T>(
  options: ValidateGeneratedAppBuildOptions,
  fn: (session: GeneratedAppE2bValidationSession | null) => Promise<T>
): Promise<T> {
  if (!env.E2B_API_KEY) {
    return fn(null)
  }

  return withShellSandbox({ lifetimeMs: DEFAULT_SHELL_SANDBOX_LIFETIME_MS }, async (runner) => {
    const session = new GeneratedAppE2bValidationSession(runner, options)
    return fn(session)
  })
}

async function validateAppTypecheckInE2b(
  files: GeneratedAppFile[],
  options: ValidateGeneratedAppBuildOptions = {}
): Promise<ValidateAppBuildResult> {
  return withShellSandbox({ lifetimeMs: TYPECHECK_TIMEOUT_MS + 60_000 }, async (runner) => {
    const session = new GeneratedAppE2bValidationSession(runner, options)
    return session.typecheck(files)
  })
}

async function validateAppBuildInE2b(
  files: GeneratedAppFile[],
  options: ValidateGeneratedAppBuildOptions = {}
): Promise<ValidateAppBuildResult> {
  return withShellSandbox({ lifetimeMs: FULL_BUILD_TIMEOUT_MS + 60_000 }, async (runner) => {
    const session = new GeneratedAppE2bValidationSession(runner, options)
    return session.build(files)
  })
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
 * Prefer {@link withGeneratedAppE2bValidationSession} + session.typecheck in repair loops.
 */
export async function validateGeneratedAppPreDeploy(
  outputDir: string,
  files: GeneratedAppFile[],
  options: ValidateGeneratedAppBuildOptions = {},
  session?: GeneratedAppE2bValidationSession | null
): Promise<ValidateAppBuildResult> {
  if (session) {
    return session.typecheck(files)
  }
  return validateGeneratedAppTypecheck(outputDir, files, options)
}

/**
 * Final production compile gate after fast typecheck passes: full next build in E2B when configured.
 * Prefer {@link withGeneratedAppE2bValidationSession} + session.build in repair loops.
 */
export async function validateGeneratedAppProductionBuild(
  outputDir: string,
  files: GeneratedAppFile[],
  options: ValidateGeneratedAppBuildOptions = {},
  session?: GeneratedAppE2bValidationSession | null
): Promise<ValidateAppBuildResult> {
  if (session) {
    return session.build(files)
  }

  if (env.E2B_API_KEY) {
    return validateGeneratedAppBuild(outputDir, files, options)
  }

  return { validated: true, output: 'Skipped final build (E2B not configured)', method: 'skipped' }
}

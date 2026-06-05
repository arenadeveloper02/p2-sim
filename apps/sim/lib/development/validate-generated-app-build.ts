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

function formatExecError(error: unknown): string {
  const err = error as { stdout?: string; stderr?: string; message?: string }
  return [err.stdout, err.stderr, err.message].filter(Boolean).join('\n')
}

async function runNpmInDir(outputDir: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync(NPM_CMD, args, {
    cwd: outputDir,
    encoding: 'utf-8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: BUILD_TIMEOUT_MS,
  })
  return [stdout, stderr].filter(Boolean).join('\n')
}

async function validateAppBuildLocally(outputDir: string): Promise<ValidateAppBuildResult> {
  if (!existsSync(join(outputDir, 'package.json'))) {
    return {
      validated: false,
      output: 'Build validation failed: package.json is missing from the generated app',
      method: 'local',
    }
  }

  const logs: string[] = []

  try {
    logger.info('Running local npm install for generated app', { outputDir })
    logs.push('=== npm install ===')
    logs.push(await runNpmInDir(outputDir, ['install', '--no-audit', '--no-fund']))

    logger.info('Running local npm run build for generated app', { outputDir })
    logs.push('=== npm run build ===')
    logs.push(await runNpmInDir(outputDir, ['run', 'build']))

    return { validated: true, output: logs.join('\n'), method: 'local' }
  } catch (error) {
    logs.push(formatExecError(error))
    return { validated: false, output: logs.join('\n'), method: 'local' }
  }
}

async function validateAppBuildInE2b(files: GeneratedAppFile[]): Promise<ValidateAppBuildResult> {
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
    'npm install --prefer-offline --no-audit --no-fund 2>&1',
    'npm run build 2>&1',
    'echo "__SIM_RESULT__={\\"buildOk\\":true}"',
  ].join('\n')

  const result = await executeShellInE2B({
    code: shellScript,
    envs: { NODE_ENV: 'production' },
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
 * Runs npm install and npm run build to verify the generated Next.js app compiles.
 * Prefers E2B when configured; otherwise validates in the local output directory.
 */
export async function validateGeneratedAppBuild(
  outputDir: string,
  files: GeneratedAppFile[]
): Promise<ValidateAppBuildResult> {
  if (env.E2B_API_KEY) {
    logger.info('Validating generated app build in E2B')
    return validateAppBuildInE2b(files)
  }

  try {
    return await validateAppBuildLocally(outputDir)
  } catch (error) {
    const message = toError(error).message
    return {
      validated: false,
      output: `Local build validation failed: ${message}. Ensure Node.js and npm are installed.`,
      method: 'local',
    }
  }
}

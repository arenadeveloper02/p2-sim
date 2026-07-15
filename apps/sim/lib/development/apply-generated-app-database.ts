import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync, readFileSync } from 'fs'
import { writeFile } from 'fs/promises'
import { join } from 'path'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import {
  buildRepoSummaryContent,
  GENERATED_APP_REPO_SUMMARY_PATH,
  type NormalizeGeneratedAppFilesOptions,
} from '@/lib/development/normalize-generated-app-files'
import { resolveNeonConnectionUri } from '@/lib/development/provision-neon-via-api'
import type { GeneratedAppFile } from '@/lib/development/validate-generated-app-build'
import { getPrismaSchemaMigrationSafetyIssues } from '@/lib/development/validate-generated-app-structure'

const logger = createLogger('ApplyGeneratedAppDatabase')

const execFileAsync = promisify(execFile)
const DB_APPLY_TIMEOUT_MS = 180_000
const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm'

export interface ApplyGeneratedAppDatabaseInput {
  outputDir: string
  databaseUrl: string
}

export interface ApplyGeneratedAppDatabaseResult {
  success: boolean
  output: string
  error?: string
}

export interface SyncGeneratedAppDatabaseInput {
  outputDir: string
  databaseUrl?: string
  neonProjectId?: string
  neonApiKey?: string
  files?: GeneratedAppFile[]
  /** Pre-edit schema — when set, unsafe edits are blocked even if Neon sync is skipped. */
  originalPrismaSchema?: string
}

export interface SyncGeneratedAppDatabaseResult {
  applied: boolean
  output?: string
  databaseUrl?: string
  error?: string
}

function formatExecError(error: unknown): string {
  const err = error as { stdout?: string; stderr?: string; message?: string }
  return [err.stdout, err.stderr, err.message].filter(Boolean).join('\n')
}

async function runNpmInDir(
  outputDir: string,
  args: string[],
  envOverrides: Record<string, string>
): Promise<string> {
  const { stdout, stderr } = await execFileAsync(NPM_CMD, args, {
    cwd: outputDir,
    encoding: 'utf-8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: DB_APPLY_TIMEOUT_MS,
    env: { ...process.env, ...envOverrides },
  })
  return [stdout, stderr].filter(Boolean).join('\n')
}

function packageJsonHasPrismaSeed(outputDir: string): boolean {
  try {
    const raw = readFileSync(join(outputDir, 'package.json'), 'utf-8')
    const pkg = JSON.parse(raw) as { prisma?: { seed?: string } }
    return Boolean(pkg.prisma?.seed?.trim())
  } catch {
    return false
  }
}

/**
 * Parses the Neon project id recorded in REPO_SUMMARY.md during generate/deploy.
 */
export function parseNeonProjectIdFromRepoSummary(content: string): string | undefined {
  const backtickMatch = content.match(/\*\*Neon project ID:\*\*\s*`([^`]+)`/i)
  if (backtickMatch?.[1]?.trim()) {
    return backtickMatch[1].trim()
  }

  const plainMatch = content.match(/Neon project ID:\s*([^\s\n`]+)/i)
  return plainMatch?.[1]?.trim()
}

/**
 * Resolves a Postgres connection string for schema sync (provision result, Neon API, or REPO_SUMMARY).
 */
export async function resolveGeneratedAppDatabaseUrl(
  input: SyncGeneratedAppDatabaseInput
): Promise<string | undefined> {
  const direct = input.databaseUrl?.trim()
  if (direct) {
    return direct
  }

  const neonApiKey = input.neonApiKey?.trim()
  if (!neonApiKey) {
    return undefined
  }

  let neonProjectId = input.neonProjectId?.trim()
  if (!neonProjectId && input.files) {
    const summary = input.files.find(
      (file) => file.path === GENERATED_APP_REPO_SUMMARY_PATH
    )?.content
    if (summary) {
      neonProjectId = parseNeonProjectIdFromRepoSummary(summary)
    }
  }

  if (!neonProjectId) {
    return undefined
  }

  try {
    return await resolveNeonConnectionUri(neonApiKey, neonProjectId)
  } catch (error) {
    logger.warn('Failed to resolve Neon connection URI for existing project', {
      neonProjectId,
      error: toError(error).message,
    })
    return undefined
  }
}

/**
 * Applies Prisma schema and optional seed/SQL scripts to the target Neon database.
 */
export async function applyGeneratedAppDatabase(
  input: ApplyGeneratedAppDatabaseInput
): Promise<ApplyGeneratedAppDatabaseResult> {
  const outputDir = input.outputDir
  const databaseUrl = input.databaseUrl.trim()
  const schemaPath = join(outputDir, 'prisma/schema.prisma')

  if (!existsSync(join(outputDir, 'package.json'))) {
    return { success: false, output: '', error: 'package.json is missing from the generated app' }
  }

  if (!existsSync(schemaPath)) {
    return {
      success: false,
      output: '',
      error: 'prisma/schema.prisma is missing from the generated app',
    }
  }

  const logs: string[] = []
  const databaseEnv = { DATABASE_URL: databaseUrl }

  try {
    logger.info('Applying generated app database schema to Neon', { outputDir })

    if (!existsSync(join(outputDir, 'node_modules'))) {
      logs.push('=== npm install ===')
      logs.push(
        await runNpmInDir(
          outputDir,
          ['install', '--include=dev', '--legacy-peer-deps', '--no-audit', '--no-fund'],
          databaseEnv
        )
      )
    }

    logs.push('=== prisma generate ===')
    logs.push(await runNpmInDir(outputDir, ['exec', 'prisma', 'generate'], databaseEnv))

    logs.push('=== prisma db push ===')
    // Match Vercel: generated apps run plain `prisma db push` (no --accept-data-loss).
    // Accepting data loss here would drop columns locally, push the bad schema, then fail on
    // Vercel when the live Neon still has those columns — or silently destroy data when URLs match.
    logs.push(await runNpmInDir(outputDir, ['exec', 'prisma', 'db', 'push'], databaseEnv))

    const seedSqlPath = join(outputDir, 'db/seed.sql')
    if (existsSync(seedSqlPath)) {
      logs.push('=== prisma db execute (db/seed.sql) ===')
      logs.push(
        await runNpmInDir(
          outputDir,
          [
            'exec',
            'prisma',
            'db',
            'execute',
            '--file',
            'db/seed.sql',
            '--schema',
            'prisma/schema.prisma',
          ],
          databaseEnv
        )
      )
    }

    const hasSeedTs = existsSync(join(outputDir, 'prisma/seed.ts'))
    if (hasSeedTs || packageJsonHasPrismaSeed(outputDir)) {
      logs.push('=== prisma db seed ===')
      try {
        logs.push(await runNpmInDir(outputDir, ['exec', 'prisma', 'db', 'seed'], databaseEnv))
      } catch (seedError) {
        logger.warn('prisma db seed failed (non-fatal)', { error: formatExecError(seedError) })
        logs.push(formatExecError(seedError))
      }
    }

    return { success: true, output: logs.join('\n') }
  } catch (error) {
    const message = formatExecError(error)
    logs.push(message)
    logger.error('Failed to apply generated app database schema', { error: message })
    return { success: false, output: logs.join('\n'), error: message }
  }
}

/**
 * Resolves DATABASE_URL and runs prisma db push + optional seeds against Neon before git push.
 */
export async function syncGeneratedAppDatabase(
  input: SyncGeneratedAppDatabaseInput
): Promise<SyncGeneratedAppDatabaseResult> {
  const files = input.files ?? []
  const migrationIssues = getPrismaSchemaMigrationSafetyIssues(files, input.originalPrismaSchema)
  if (migrationIssues.length > 0) {
    const message = [
      'prisma/schema.prisma changes would fail Vercel `prisma db push` (data loss / unexecutable against live rows):',
      ...migrationIssues.map((issue, index) => `${index + 1}. ${issue}`),
    ].join('\n')
    logger.error('Blocking generated app database sync due to unsafe Prisma schema edit', {
      issueCount: migrationIssues.length,
    })
    return { applied: false, error: message, output: message }
  }

  const databaseUrl = await resolveGeneratedAppDatabaseUrl(input)
  if (!databaseUrl) {
    logger.info(
      'Skipping local database sync — connection URL unavailable (Vercel build will run prisma db push)'
    )
    return { applied: false }
  }

  const result = await applyGeneratedAppDatabase({ outputDir: input.outputDir, databaseUrl })
  if (!result.success) {
    return {
      applied: false,
      databaseUrl,
      output: result.output,
      error: result.error ?? 'Database schema apply failed',
    }
  }

  logger.info('Generated app database schema applied to Neon', { outputDir: input.outputDir })
  return { applied: true, databaseUrl, output: result.output }
}

/**
 * Records Neon project metadata in REPO_SUMMARY.md and applies schema/seed to the database before git push.
 */
export async function prepareGeneratedAppForDatabaseDeploy(input: {
  outputDir: string
  files: GeneratedAppFile[]
  summaryOptions: NormalizeGeneratedAppFilesOptions
  databaseUrl?: string
  neonProjectId?: string
  neonApiKey?: string
  originalPrismaSchema?: string
}): Promise<SyncGeneratedAppDatabaseResult> {
  const summaryOptions: NormalizeGeneratedAppFilesOptions = {
    ...input.summaryOptions,
    neonProjectId: input.neonProjectId ?? input.summaryOptions.neonProjectId,
  }

  const summaryContent = buildRepoSummaryContent(input.files, summaryOptions)
  await writeFile(join(input.outputDir, GENERATED_APP_REPO_SUMMARY_PATH), summaryContent, 'utf-8')

  return syncGeneratedAppDatabase({
    outputDir: input.outputDir,
    databaseUrl: input.databaseUrl,
    neonProjectId: input.neonProjectId,
    neonApiKey: input.neonApiKey,
    files: input.files,
    originalPrismaSchema: input.originalPrismaSchema,
  })
}

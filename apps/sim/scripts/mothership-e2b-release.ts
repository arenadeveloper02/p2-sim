import {
  isImmutableE2BTemplateRef,
  isValidE2BTemplateName,
  isValidE2BTemplateReferenceName,
} from '@sim/utils/sandbox-references'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  MOTHERSHIP_E2B_DEFAULT_BASE_TEMPLATE,
  MOTHERSHIP_E2B_DEFAULT_TEMPLATE_NAME,
} from '@/scripts/mothership-sandbox-packages'
import { upsertEnvVar } from '@/scripts/upsert-env-var'

export const MOTHERSHIP_E2B_ENV_KEY = 'MOTHERSHIP_E2B_TEMPLATE_ID'

export interface MothershipBuildArgs {
  templateName: string
  baseTemplate: string
  pipExtras: string[]
  skipCache: boolean
  writeEnv: boolean
}

/** Parses CLI flags for the mothership E2B builder. */
export function parseMothershipBuildArgs(argv: readonly string[]): MothershipBuildArgs {
  const pipExtras: string[] = []
  let templateName = MOTHERSHIP_E2B_DEFAULT_TEMPLATE_NAME
  let baseTemplate = MOTHERSHIP_E2B_DEFAULT_BASE_TEMPLATE
  let skipCache = false
  let writeEnv = true

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--no-cache') {
      skipCache = true
      continue
    }
    if (arg === '--no-write-env') {
      writeEnv = false
      continue
    }
    if (arg === '--name') {
      const value = argv[++i]
      if (!value || value.startsWith('--')) throw new Error('--name requires a template name')
      if (!isValidE2BTemplateName(value)) {
        throw new Error('--name must be an untagged E2B template name (stable alias)')
      }
      if (value.startsWith('sim-sbx-')) {
        throw new Error(
          '--name must be a stable alias (e.g. sim-mothership), not a content-addressed sim-sbx-* image'
        )
      }
      templateName = value
      continue
    }
    if (arg === '--base-template') {
      const value = argv[++i]
      if (!value || value.startsWith('--')) {
        throw new Error('--base-template requires a template name or immutable name:build-id')
      }
      if (!isValidE2BTemplateReferenceName(value) && !isImmutableE2BTemplateRef(value)) {
        throw new Error(
          '--base-template must be an E2B template name or immutable <template>:<build-id>'
        )
      }
      baseTemplate = value
      continue
    }
    if (arg === '--pip') {
      const value = argv[++i]
      if (!value || value.startsWith('--')) {
        throw new Error('--pip requires a PyPI spec (e.g. requests==2.32.4)')
      }
      pipExtras.push(value)
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return { templateName, baseTemplate, pipExtras, skipCache, writeEnv }
}

/** Updates dotenv files so MOTHERSHIP_E2B_TEMPLATE_ID stays the stable alias. */
export async function writeMothershipTemplateEnv(
  templateName: string,
  envPaths: readonly string[]
): Promise<string[]> {
  const updated: string[] = []
  for (const envPath of envPaths) {
    let contents: string
    try {
      contents = await readFile(envPath, 'utf8')
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? (error as { code?: string }).code
          : undefined
      if (code === 'ENOENT') continue
      throw error
    }
    const next = upsertEnvVar(contents, MOTHERSHIP_E2B_ENV_KEY, templateName)
    if (next !== contents) {
      await mkdir(path.dirname(envPath), { recursive: true })
      await writeFile(envPath, next, 'utf8')
    }
    updated.push(envPath)
  }
  return updated
}

/** Candidate dotenv paths when the builder runs from apps/sim or the repo root. */
export function defaultMothershipEnvPaths(cwd = process.cwd()): string[] {
  return [...new Set([path.resolve(cwd, '.env'), path.resolve(cwd, 'apps/sim/.env'), path.resolve(cwd, '../.env')])]
}

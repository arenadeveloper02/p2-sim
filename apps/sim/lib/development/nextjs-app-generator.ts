import { existsSync } from 'fs'
import { mkdir, rm, writeFile } from 'fs/promises'
import { dirname, join, normalize, relative, resolve } from 'path'
import Anthropic from '@anthropic-ai/sdk'
import { transformJSONSchema } from '@anthropic-ai/sdk/lib/transform-json-schema'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { env } from '@/lib/core/config/env'
import {
  deployPreparedVercelProject,
  prepareVercelProjectForDeploy,
} from '@/lib/development/deploy-generated-app-to-vercel'
import { prepareGeneratedAppForDatabaseDeploy } from '@/lib/development/apply-generated-app-database'
import type { DevelopmentReferenceMedia } from '@/lib/development/resolve-development-reference-image'
import { resolveDevelopmentDeployEnv, DEVELOPMENT_REQUIRES_DATABASE } from '@/lib/development/resolve-development-env'
import {
  GENERATED_APP_NEON_DATABASE_GUIDANCE,
  GENERATED_APP_PRISMA_ALIGNMENT_GUIDANCE,
  GENERATED_APP_DATABASE_FILE_PATHS,
  GENERATED_APP_AUTH_GUIDANCE,
  GENERATED_APP_COMMON_FAILURES_GUIDANCE,
  GENERATED_APP_DATABASE_GUIDANCE,
  GENERATED_APP_DATABASE_EDIT_GUIDANCE,
  GENERATED_APP_DEPENDENCY_GUIDANCE,
  GENERATED_APP_IMPORT_GUIDANCE,
  GENERATED_APP_COMPONENT_FILES_GUIDANCE,
  GENERATED_APP_PAGE_CLIENT_CONTRACT_GUIDANCE,
  GENERATED_APP_JSX_GUIDANCE,
  GENERATED_APP_README_GUIDANCE,
  GENERATED_APP_REFERENCE_PDF_GUIDANCE,
  GENERATED_APP_REPO_SUMMARY_GUIDANCE,
  GENERATED_APP_REPO_SUMMARY_PATH,
  GENERATED_APP_STYLING_GUIDANCE,
  GENERATED_APP_TYPESCRIPT_GUIDANCE,
  GENERATED_APP_VALIDATION_GUIDANCE,
  PINNED_NEXT_VERSION,
  PINNED_REACT_VERSION,
  buildRepoSummaryContent,
  ensureRepoSummaryFile,
  normalizeGeneratedAppFiles,
} from '@/lib/development/normalize-generated-app-files'
import {
  ensureGitHubRepository,
  pushGeneratedAppToGitHub,
} from '@/lib/development/push-generated-app-to-github'
import {
  formatBuildErrorsSummary,
  logGeneratedAppValidationErrors,
} from '@/lib/development/format-generated-app-build-errors'
import { validateGeneratedAppTypecheck } from '@/lib/development/validate-generated-app-build'
import {
  formatStructureValidationIssues,
  validateGeneratedAppStructure,
  collectReferencedAliasPathsInFiles,
} from '@/lib/development/validate-generated-app-structure'

const logger = createLogger('NextjsAppGenerator')

const GENERATED_APPS_DIR = 'generated-apps'
const MODEL_ID = 'claude-sonnet-4-6'
const STRUCTURED_OUTPUTS_BETA = 'structured-outputs-2025-11-13'
/** Sonnet 4.6 supports large outputs; streaming is used above the SDK non-streaming cap. */
const MAX_OUTPUT_TOKENS = 64_000
/** More files allow complex multi-page apps without stub components. */
const MAX_GENERATED_FILES = 45
const FILES_PER_BATCH = 10
const MAX_LLM_CONTINUATION_TURNS = 1
const MAX_OPTIONAL_PAGE_PATHS = 24

const REQUIRED_APP_FILE_PATHS = [
  'package.json',
  'tsconfig.json',
  'next.config.ts',
  'postcss.config.mjs',
  'tailwind.config.ts',
  'app/layout.tsx',
  'app/page.tsx',
  'app/globals.css',
  '.gitignore',
  'README.md',
  GENERATED_APP_REPO_SUMMARY_PATH,
  '.env.example',
] as const
/** Max LLM repair rounds after a failed TypeScript check before deploy. */
const MAX_BUILD_REPAIR_ROUNDS = 3
/** Max redeploy cycles when Vercel build fails after local build passed. */
const MAX_VERCEL_REPAIR_ROUNDS = 4
const MAX_BUILD_LOG_CHARS = 12_000

const APP_SPEC_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    appName: { type: 'string' },
    repoName: { type: 'string' },
    description: { type: 'string' },
    features: { type: 'array', items: { type: 'string' } },
    requiresDatabase: { type: 'boolean' },
    files: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
    },
  },
  required: ['appName', 'repoName', 'description', 'features', 'requiresDatabase', 'files'],
  additionalProperties: false,
}

const APP_MANIFEST_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    appName: { type: 'string' },
    repoName: { type: 'string' },
    description: { type: 'string' },
    features: { type: 'array', items: { type: 'string' } },
    requiresDatabase: { type: 'boolean' },
    filePaths: { type: 'array', items: { type: 'string' } },
  },
  required: ['appName', 'repoName', 'description', 'features', 'requiresDatabase', 'filePaths'],
  additionalProperties: false,
}

const FILE_BATCH_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    files: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
    },
  },
  required: ['files'],
  additionalProperties: false,
}

interface LlmAppManifest {
  appName: string
  repoName: string
  description: string
  features: string[]
  requiresDatabase?: boolean
  filePaths: string[]
}

/** Anthropic SDK requires streaming when max_tokens exceeds this limit. */
const ANTHROPIC_NON_STREAMING_MAX_TOKENS = 21333

export interface GenerateNextjsAppInput {
  userInput: string
  repoName?: string
  privateRepo?: boolean
  referenceImage?: DevelopmentReferenceMedia
}

export interface GeneratedAppFile {
  path: string
  content: string
}

export interface GenerateNextjsAppResult {
  success: boolean
  appName?: string
  repoName?: string
  description?: string
  features?: string[]
  outputPath?: string
  absoluteOutputPath?: string
  fileCount?: number
  buildValidated?: boolean
  buildOutput?: string
  gitPushed?: boolean
  githubHtmlUrl?: string
  githubCloneUrl?: string
  githubOwner?: string
  githubRepoName?: string
  gitPushError?: string
  vercelDeployed?: boolean
  vercelUrl?: string
  vercelDeploymentUrl?: string
  vercelProjectId?: string
  vercelDeploymentId?: string
  vercelInspectorUrl?: string
  vercelDeployError?: string
  requiresDatabase?: boolean
  databaseProvisioned?: boolean
  neonProjectId?: string
  databaseProvisionError?: string
  error?: string
  mode?: 'generate' | 'edit'
}

interface LlmAppSpec {
  appName: string
  repoName: string
  description: string
  features: string[]
  requiresDatabase?: boolean
  files: GeneratedAppFile[]
}

/**
 * Resolves the monorepo root by walking up from the current working directory.
 * Prefers the directory that contains `bun.lock` (workspace root), not nested package roots like `apps/sim`.
 */
export function findMonorepoRoot(startDir: string = process.cwd()): string {
  let dir = resolve(startDir)
  let packageJsonFallback = dir

  while (true) {
    if (existsSync(join(dir, 'bun.lock')) || existsSync(join(dir, 'turbo.json'))) {
      return dir
    }
    if (existsSync(join(dir, 'package.json'))) {
      packageJsonFallback = dir
    }
    const parent = dirname(dir)
    if (parent === dir) {
      break
    }
    dir = parent
  }

  return packageJsonFallback
}

/**
 * Converts a display name into a safe repository folder name.
 */
export function slugifyRepoName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'generated-app'
}

/**
 * Ensures a relative file path cannot escape the output directory.
 */
export function sanitizeRelativeFilePath(filePath: string): string | null {
  const normalized = normalize(filePath.replace(/\\/g, '/'))
  if (normalized.startsWith('..') || normalized.startsWith('/')) {
    return null
  }
  return normalized
}

function extractJsonFromLlmText(text: string): string {
  const trimmed = text.trim()

  /** Structured outputs return raw JSON; do not scan for inner ``` (common in file contents). */
  if (trimmed.startsWith('{')) {
    return trimmed
  }

  const fencePrefix = /^```(?:json)?\s*\n?/i
  if (fencePrefix.test(trimmed)) {
    const withoutOpen = trimmed.replace(fencePrefix, '')
    const closeIdx = withoutOpen.lastIndexOf('```')
    if (closeIdx >= 0) {
      const inner = withoutOpen.slice(0, closeIdx).trim()
      if (inner.startsWith('{')) {
        return inner
      }
    }
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }
  return trimmed
}

type AnthropicMessageParams = Anthropic.Messages.MessageCreateParamsNonStreaming & {
  output_config?: {
    format?: { type: 'json_schema'; schema: Record<string, unknown> }
  }
}

async function createAnthropicMessage(
  anthropic: Anthropic,
  params: AnthropicMessageParams
): Promise<Anthropic.Messages.Message> {
  if (params.max_tokens > ANTHROPIC_NON_STREAMING_MAX_TOKENS) {
    const stream = anthropic.messages.stream(
      params as Anthropic.Messages.MessageStreamParams
    )
    return stream.finalMessage()
  }
  return anthropic.messages.create(params)
}

function parseAppSpecJson(text: string): LlmAppSpec {
  const jsonText = extractJsonFromLlmText(text)

  try {
    return JSON.parse(jsonText) as LlmAppSpec
  } catch (error) {
    const message = toError(error).message
    if (!jsonText.trimStart().startsWith('{')) {
      const preview = text.trim().slice(0, 120).replace(/\s+/g, ' ')
      throw new Error(
        `Model returned non-JSON (${preview}…). Try a simpler app description with fewer pages.`
      )
    }
    throw new Error(
      `Failed to parse generated app JSON (${message}). Try a simpler app description with fewer pages.`
    )
  }
}

function createDevelopmentAnthropicClient(apiKey: string): Anthropic {
  return new Anthropic({
    apiKey,
    defaultHeaders: { 'anthropic-beta': STRUCTURED_OUTPUTS_BETA },
  })
}

function truncateBuildLog(output: string): string {
  if (output.length <= MAX_BUILD_LOG_CHARS) {
    return output
  }
  return `${output.slice(-MAX_BUILD_LOG_CHARS)}\n…(truncated)`
}

/** Development block always provisions Neon Postgres + Prisma for generated apps. */
function resolveRequiresDatabase(
  _spec: Pick<LlmAppSpec, 'requiresDatabase' | 'files'>
): boolean {
  return DEVELOPMENT_REQUIRES_DATABASE
}

interface NormalizeAppSpecOptions {
  /** Skip the file-count cap — use for edit/repair flows that merge with an existing repo. */
  preserveAllFiles?: boolean
  /** Recorded in REPO_SUMMARY.md when the spec is normalized. */
  latestUserRequest?: string
}

/**
 * Caps file count for LLM-generated apps while always keeping required scaffolding
 * (package.json, Tailwind config, Prisma files, etc.).
 */
export function capGeneratedAppFiles(
  files: GeneratedAppFile[],
  maxFiles: number,
  requiresDatabase: boolean
): GeneratedAppFile[] {
  if (files.length <= maxFiles) {
    return files
  }

  const requiredPaths = new Set<string>(REQUIRED_APP_FILE_PATHS)
  requiredPaths.add('next-env.d.ts')
  requiredPaths.add(GENERATED_APP_REPO_SUMMARY_PATH)
  if (requiresDatabase) {
    for (const path of GENERATED_APP_DATABASE_FILE_PATHS) {
      requiredPaths.add(path)
    }
  }

  const importReferencedPaths = collectReferencedAliasPathsInFiles(files)
  for (const path of importReferencedPaths) {
    requiredPaths.add(path)
  }

  const required: GeneratedAppFile[] = []
  const optional: GeneratedAppFile[] = []
  const seen = new Set<string>()

  for (const file of files) {
    const path = file.path.replace(/\\/g, '/')
    if (seen.has(path)) {
      continue
    }
    seen.add(path)

    if (requiredPaths.has(path)) {
      required.push({ ...file, path })
    } else {
      optional.push({ ...file, path })
    }
  }

  const optionalBudget = Math.max(0, maxFiles - required.length)
  const capped = [...required, ...optional.slice(0, optionalBudget)]

  logger.warn('Capped generated file list while preserving required scaffolding', {
    before: files.length,
    after: capped.length,
    max: maxFiles,
    dropped: files.length - capped.length,
  })

  return capped
}

function normalizeAppSpec(
  parsed: LlmAppSpec,
  repoNameHint?: string,
  options: NormalizeAppSpecOptions = {}
): LlmAppSpec {
  if (!parsed.appName || !parsed.files?.length) {
    throw new Error('LLM response missing required appName or files')
  }

  parsed.repoName = slugifyRepoName(parsed.repoName || repoNameHint || parsed.appName)
  parsed.requiresDatabase = resolveRequiresDatabase(parsed)

  if (!options.preserveAllFiles && parsed.files.length > MAX_GENERATED_FILES) {
    parsed.files = capGeneratedAppFiles(
      parsed.files,
      MAX_GENERATED_FILES,
      parsed.requiresDatabase ?? DEVELOPMENT_REQUIRES_DATABASE
    )
  }

  parsed.files = normalizeGeneratedAppFiles(parsed.files, {
    requiresDatabase: parsed.requiresDatabase,
    appName: parsed.appName,
    description: parsed.description,
    features: parsed.features,
    repoName: parsed.repoName,
    latestUserRequest: options.latestUserRequest,
  })

  return parsed
}

function getAnthropicApiKey(): string {
  const apiKey = env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is not configured. Set it to enable Next.js app generation.'
    )
  }
  return apiKey
}

function getMessageText(message: Anthropic.Messages.Message): string {
  const textBlock = message.content.find((block) => block.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('LLM did not return text content for app generation')
  }
  return textBlock.text
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

function mergeManifestFilePaths(
  manifestPaths: string[],
  requiresDatabase = DEVELOPMENT_REQUIRES_DATABASE
): string[] {
  const normalized = manifestPaths
    .map((p) => p.replace(/\\/g, '/').trim())
    .filter(Boolean)
  const requiredSet = new Set<string>(REQUIRED_APP_FILE_PATHS)
  if (requiresDatabase) {
    for (const path of GENERATED_APP_DATABASE_FILE_PATHS) {
      requiredSet.add(path)
    }
  }
  const optional = normalized.filter((p) => !requiredSet.has(p)).slice(0, MAX_OPTIONAL_PAGE_PATHS)
  const merged = [...new Set([...requiredSet, ...optional])]
  return merged.slice(0, MAX_GENERATED_FILES)
}

function isLikelyTruncationOrParseFailure(error: unknown): boolean {
  const message = toError(error).message.toLowerCase()
  return (
    message.includes('truncat') ||
    message.includes('max_tokens') ||
    message.includes('parse') ||
    message.includes('json') ||
    message.includes('non-json')
  )
}

async function requestStructuredLlm(
  anthropic: Anthropic,
  systemPrompt: string,
  messages: Anthropic.Messages.MessageParam[],
  schema: Record<string, unknown>
): Promise<Anthropic.Messages.Message> {
  return createAnthropicMessage(anthropic, {
    model: MODEL_ID,
    max_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    system: systemPrompt,
    messages,
    output_config: {
      format: {
        type: 'json_schema',
        schema: transformJSONSchema(schema),
      },
    },
  })
}

function augmentSystemPromptForReferenceImage(
  systemPrompt: string,
  referenceMedia?: DevelopmentReferenceMedia
): string {
  if (!referenceMedia) {
    return systemPrompt
  }
  return `${systemPrompt}\n\n- ${GENERATED_APP_REFERENCE_PDF_GUIDANCE}`
}

function buildReferenceContentBlock(
  referenceMedia: DevelopmentReferenceMedia
): Anthropic.Messages.ContentBlockParam {
  if (referenceMedia.mediaType !== 'application/pdf') {
    throw new Error('Reference media must be a PDF')
  }

  return {
    type: 'document',
    source: {
      type: 'base64',
      media_type: 'application/pdf',
      data: referenceMedia.base64,
    },
  }
}

function buildUserMessageContent(
  text: string,
  referenceMedia?: DevelopmentReferenceMedia
): Anthropic.Messages.MessageParam['content'] {
  if (!referenceMedia) {
    return text
  }

  return [
    buildReferenceContentBlock(referenceMedia),
    {
      type: 'text',
      text: `Reference design PDF attached — read every page and treat it as the visual source of truth. Match layout, color palette, typography, spacing, borders, component hierarchy, and visible copy. Define theme tokens in app/globals.css and tailwind.config.ts from the PDF colors and fonts — do not use a generic default theme.\n\n${text}`,
    },
  ]
}

/**
 * Requests JSON from the model; on max_tokens, continues the same JSON across turns and merges text.
 */
async function requestStructuredJsonWithContinuations<T>(
  anthropic: Anthropic,
  systemPrompt: string,
  initialUserPrompt: string,
  schema: Record<string, unknown>,
  parse: (text: string) => T,
  referenceImage?: DevelopmentReferenceMedia
): Promise<T> {
  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: 'user',
      content: buildUserMessageContent(initialUserPrompt, referenceImage),
    },
  ]
  let accumulated = ''

  for (let turn = 0; turn <= MAX_LLM_CONTINUATION_TURNS; turn++) {
    const message = await requestStructuredLlm(
      anthropic,
      augmentSystemPromptForReferenceImage(systemPrompt, referenceImage),
      messages,
      schema
    )
    const text = getMessageText(message)

    accumulated = turn === 0 ? text : `${accumulated}${text}`

    if (message.stop_reason !== 'max_tokens') {
      return parse(accumulated)
    }

    logger.warn('LLM response hit max_tokens; requesting continuation', { turn: turn + 1 })

    messages.push({ role: 'assistant', content: text })
    messages.push({
      role: 'user',
      content:
        'Your previous JSON response was cut off. Continue from the exact cut-off point and output ONLY the remaining characters needed to complete the JSON object. Do not repeat content from the start.',
    })
  }

  return parse(accumulated)
}

const SINGLE_SHOT_SYSTEM_PROMPT = `You are a senior full-stack engineer. Generate a focused Next.js ${PINNED_NEXT_VERSION} App Router app (React ${PINNED_REACT_VERSION}) in ONE response.

Respond ONLY with JSON matching the provided schema. No markdown or code fences.

Constraints:
- At most ${MAX_GENERATED_FILES} files total — use as many as needed but no more
- Required: ${REQUIRED_APP_FILE_PATHS.join(', ')} plus pages and components (max ${MAX_OPTIONAL_PAGE_PATHS} extra files)
- Generate ALL components/*.tsx files BEFORE or WITH the pages that import them — never leave dangling @/components imports
- Every component MUST contain complete, real, working UI code — NEVER a stub, placeholder, or a component that renders only its own name as text
- Reuse components; keep page files short; put shared styles in app/globals.css
- app/ at project root only (not src/app/)
- ${GENERATED_APP_COMMON_FAILURES_GUIDANCE}
- ${GENERATED_APP_DEPENDENCY_GUIDANCE}
- ${GENERATED_APP_TYPESCRIPT_GUIDANCE}
- ${GENERATED_APP_STYLING_GUIDANCE}
- ${GENERATED_APP_IMPORT_GUIDANCE}
- ${GENERATED_APP_COMPONENT_FILES_GUIDANCE}
- ${GENERATED_APP_PAGE_CLIENT_CONTRACT_GUIDANCE}
- ${GENERATED_APP_JSX_GUIDANCE}
- ${GENERATED_APP_DATABASE_GUIDANCE}
- ${GENERATED_APP_PRISMA_ALIGNMENT_GUIDANCE}
- ${GENERATED_APP_AUTH_GUIDANCE}
- ${GENERATED_APP_README_GUIDANCE}
- ${GENERATED_APP_REPO_SUMMARY_GUIDANCE}
- ${GENERATED_APP_VALIDATION_GUIDANCE}
- NEVER use localStorage.setItem or sessionStorage.setItem to persist app data — use Prisma server actions when requiresDatabase is true
- Valid TypeScript, zero build errors, no secrets`

const MANIFEST_SYSTEM_PROMPT = `You are a senior full-stack engineer planning a Next.js ${PINNED_NEXT_VERSION} App Router project (React ${PINNED_REACT_VERSION}).

Respond ONLY with JSON matching the provided schema. List file paths only — do NOT include file contents.

Constraints:
- At most ${MAX_GENERATED_FILES} file paths — list EVERY file the app truly needs so no component is left as a stub
- Include every required path: ${REQUIRED_APP_FILE_PATHS.join(', ')}
- List ALL components/*.tsx paths first (Navbar, Footer, *Client components) — then list app routes that import them
- Add up to ${MAX_OPTIONAL_PAGE_PATHS} optional page/component paths — for multi-page apps, list all page routes and shared components
- Use app/ at project root (not src/app/)
- ${GENERATED_APP_COMMON_FAILURES_GUIDANCE}
- ${GENERATED_APP_DEPENDENCY_GUIDANCE}
- ${GENERATED_APP_STYLING_GUIDANCE}
- ${GENERATED_APP_IMPORT_GUIDANCE}
- ${GENERATED_APP_COMPONENT_FILES_GUIDANCE}
- ${GENERATED_APP_PAGE_CLIENT_CONTRACT_GUIDANCE}
- ${GENERATED_APP_JSX_GUIDANCE}
- ${GENERATED_APP_DATABASE_GUIDANCE}
- ${GENERATED_APP_PRISMA_ALIGNMENT_GUIDANCE}
- ${GENERATED_APP_AUTH_GUIDANCE}
- ${GENERATED_APP_README_GUIDANCE}
- ${GENERATED_APP_REPO_SUMMARY_GUIDANCE}
- ${GENERATED_APP_VALIDATION_GUIDANCE}
- NEVER use localStorage.setItem or sessionStorage.setItem to persist app data — use Prisma server actions when requiresDatabase is true
- Never include secrets`

const FILE_BATCH_SYSTEM_PROMPT = `You are a senior full-stack engineer writing files for a Next.js ${PINNED_NEXT_VERSION} App Router project.

Respond ONLY with JSON matching the provided schema: a "files" array with path and content for each requested path.

Constraints:
- Return EVERY requested path with complete, real, working file content — NEVER a stub or a component that renders only its own name as text
- Every component file must render actual UI — buttons, inputs, text, layout — not placeholder content like "<div>ComponentName</div>"
- TypeScript strict, no any, no @ts-ignore
- Keep individual files concise; share styles in app/globals.css
- ${GENERATED_APP_COMMON_FAILURES_GUIDANCE}
- ${GENERATED_APP_DEPENDENCY_GUIDANCE}
- ${GENERATED_APP_TYPESCRIPT_GUIDANCE}
- ${GENERATED_APP_STYLING_GUIDANCE}
- ${GENERATED_APP_IMPORT_GUIDANCE}
- ${GENERATED_APP_COMPONENT_FILES_GUIDANCE}
- ${GENERATED_APP_PAGE_CLIENT_CONTRACT_GUIDANCE}
- ${GENERATED_APP_JSX_GUIDANCE}
- ${GENERATED_APP_DATABASE_GUIDANCE}
- ${GENERATED_APP_PRISMA_ALIGNMENT_GUIDANCE}
- ${GENERATED_APP_AUTH_GUIDANCE}
- ${GENERATED_APP_README_GUIDANCE}
- ${GENERATED_APP_REPO_SUMMARY_GUIDANCE}
- ${GENERATED_APP_VALIDATION_GUIDANCE}
- NEVER use localStorage.setItem or sessionStorage.setItem to persist app data — use Prisma server actions when requiresDatabase is true
- Code must compile with zero errors when combined with other project files
- Never include secrets`

async function requestAppManifestFromLlm(
  anthropic: Anthropic,
  userInput: string,
  repoNameHint?: string,
  referenceImage?: DevelopmentReferenceMedia
): Promise<LlmAppManifest> {
  const userPrompt = repoNameHint
    ? `User request:\n${userInput}\n\nPreferred repository folder name: ${repoNameHint}`
    : `User request:\n${userInput}`

  const manifest = await requestStructuredJsonWithContinuations(
    anthropic,
    MANIFEST_SYSTEM_PROMPT,
    userPrompt,
    APP_MANIFEST_JSON_SCHEMA,
    (text) => JSON.parse(extractJsonFromLlmText(text)) as LlmAppManifest,
    referenceImage
  )

  if (!manifest.appName || !manifest.filePaths?.length) {
    throw new Error('LLM manifest missing appName or filePaths')
  }

  manifest.repoName = slugifyRepoName(manifest.repoName || repoNameHint || manifest.appName)
  manifest.requiresDatabase = resolveRequiresDatabase({
    requiresDatabase: manifest.requiresDatabase,
    files: manifest.filePaths.map((path) => ({ path, content: '' })),
  })
  manifest.filePaths = mergeManifestFilePaths(manifest.filePaths, manifest.requiresDatabase)

  return manifest
}

async function requestFileBatchFromLlm(
  anthropic: Anthropic,
  options: {
    paths: string[]
    userInput: string
    appName: string
    description: string
    existingPaths?: string[]
    referenceImage?: DevelopmentReferenceMedia
  },
  allowBatchRetry = true
): Promise<GeneratedAppFile[]> {
  const { paths, userInput, appName, description, referenceImage } = options

  const existingPaths = options.existingPaths ?? []

  const userPrompt = `App name: ${appName}
Description: ${description}

Original user request:
${userInput}

Generate complete contents for these paths only:
${paths.map((p) => `- ${p}`).join('\n')}

${
  existingPaths.length > 0
    ? `Already generated paths (you may import from @/ only if the target is in this list or in the batch above):\n${existingPaths.map((p) => `- ${p}`).join('\n')}`
    : ''
}`

  const result = await requestStructuredJsonWithContinuations(
    anthropic,
    FILE_BATCH_SYSTEM_PROMPT,
    userPrompt,
    FILE_BATCH_JSON_SCHEMA,
    (text) => JSON.parse(extractJsonFromLlmText(text)) as { files: GeneratedAppFile[] },
    referenceImage
  )

  const byPath = new Map<string, GeneratedAppFile>()
  for (const file of result.files ?? []) {
    if (file.path && typeof file.content === 'string') {
      byPath.set(file.path.replace(/\\/g, '/'), file)
    }
  }

  const files: GeneratedAppFile[] = []
  const missing: string[] = []

  for (const path of paths) {
    const file = byPath.get(path)
    if (file) {
      files.push(file)
    } else {
      missing.push(path)
    }
  }

  if (missing.length === 0) {
    return files
  }

  if (paths.length === 1) {
    throw new Error(`Failed to generate file content for: ${missing.join(', ')}`)
  }

  if (!allowBatchRetry) {
    throw new Error(`Failed to generate file content for: ${missing.join(', ')}`)
  }

  logger.warn('Batch missing files; retrying batch once', { missing })
  const retryFiles = await requestFileBatchFromLlm(
    anthropic,
    { paths: missing, userInput, appName, description, referenceImage },
    false
  )
  files.push(...retryFiles)

  return files
}

async function requestSingleShotAppSpecFromLlm(
  userInput: string,
  repoNameHint?: string,
  referenceImage?: DevelopmentReferenceMedia
): Promise<LlmAppSpec> {
  const anthropic = createDevelopmentAnthropicClient(getAnthropicApiKey())
  const userPrompt = repoNameHint
    ? `User request:\n${userInput}\n\nPreferred repository folder name: ${repoNameHint}`
    : `User request:\n${userInput}`

  logger.info('Generating app in a single LLM request', {
    hasReferenceImage: Boolean(referenceImage),
  })

  const parsed = await requestStructuredJsonWithContinuations(
    anthropic,
    SINGLE_SHOT_SYSTEM_PROMPT,
    userPrompt,
    APP_SPEC_JSON_SCHEMA,
    (text) => parseAppSpecJson(text),
    referenceImage
  )

  return normalizeAppSpec(parsed, repoNameHint)
}

/**
 * Fallback: manifest + parallel file batches when single-shot output is too large.
 */
async function requestBatchedAppSpecFromLlm(
  userInput: string,
  repoNameHint?: string,
  referenceImage?: DevelopmentReferenceMedia
): Promise<LlmAppSpec> {
  const anthropic = createDevelopmentAnthropicClient(getAnthropicApiKey())
  const manifest = await requestAppManifestFromLlm(anthropic, userInput, repoNameHint, referenceImage)

  const pathBatches = chunkArray(manifest.filePaths, FILES_PER_BATCH)

  logger.info('Generating app files in parallel batches', {
    totalPaths: manifest.filePaths.length,
    batches: pathBatches.length,
  })

  const allFiles: GeneratedAppFile[] = []

  for (const paths of pathBatches) {
    const batchFiles = await requestFileBatchFromLlm(anthropic, {
      paths,
      userInput,
      appName: manifest.appName,
      description: manifest.description,
      existingPaths: [
        ...manifest.filePaths,
        ...allFiles.map((f) => f.path.replace(/\\/g, '/')),
      ],
      referenceImage,
    })
    allFiles.push(...batchFiles)
  }

  return normalizeAppSpec(
    {
      appName: manifest.appName,
      repoName: manifest.repoName,
      description: manifest.description,
      features: manifest.features,
      requiresDatabase: manifest.requiresDatabase,
      files: allFiles,
    },
    repoNameHint
  )
}

/** Full app JSON in one call (used for build repair). */
async function requestFullAppSpecFromLlm(
  systemPrompt: string,
  userPrompt: string,
  repoNameHint?: string,
  options: NormalizeAppSpecOptions = {}
): Promise<LlmAppSpec> {
  const anthropic = createDevelopmentAnthropicClient(getAnthropicApiKey())

  const parsed = await requestStructuredJsonWithContinuations(
    anthropic,
    systemPrompt,
    userPrompt,
    APP_SPEC_JSON_SCHEMA,
    (text) => parseAppSpecJson(text)
  )

  return normalizeAppSpec(parsed, repoNameHint, options)
}

async function generateAppSpecWithLlm(
  userInput: string,
  repoNameHint?: string,
  referenceImage?: DevelopmentReferenceMedia
): Promise<LlmAppSpec> {
  try {
    return await requestSingleShotAppSpecFromLlm(userInput, repoNameHint, referenceImage)
  } catch (error) {
    if (!isLikelyTruncationOrParseFailure(error)) {
      throw error
    }
    logger.warn('Single-shot app generation failed; using batched fallback', {
      error: toError(error).message,
      hasReferenceImage: Boolean(referenceImage),
    })
    return requestBatchedAppSpecFromLlm(userInput, repoNameHint, referenceImage)
  }
}

async function repairAppSpecWithLlm(
  spec: LlmAppSpec,
  buildLog: string,
  userInput: string
): Promise<LlmAppSpec> {
  const repairSystemPrompt = `You are a senior full-stack engineer fixing a Next.js ${PINNED_NEXT_VERSION} App Router project that failed TypeScript validation (tsc --noEmit).

Respond ONLY with JSON matching the provided schema. Return the full corrected file set.

Fix ALL errors in the build log so npm install && npx tsc --noEmit succeed with ZERO TypeScript errors.
Fix ALL structure validation issues listed in the build log, including missing @/ imports, props interfaces, "use client" placement, Prisma usage, Tailwind config, and build scripts.
When the build log says "Missing file for import @/components/X", ADD components/X.tsx with full UI — every imported component must exist in files[].
Pay special attention to: TS2305 "has no exported member" (export the symbol from the module that defines it — e.g. add getRecentTasks/getUserById to lib/actions.ts when pages import them), TS2322 IntrinsicAttributes & XxxClientProps (page prop names must match XxxClientProps fields exactly — update page AND component together), TS2739 JwtPayload missing UserData fields (use getUserById(auth.id), do not pass getAuthUser() result as UserData), TS1109 "Expression expected" (usually a split import — add \`import {\` before orphan specifiers after \`} from 'package';\`), TS2459 "declares X locally, but it is not exported" (import the type from @/lib/types, not @/lib/actions), TS2304 "Cannot find name" (add missing import type from @/lib/types), TS2307 Cannot find module 'lucide-react' (add lucide-react to package.json dependencies), TS1005 "'>' expected" (fix JSX — use return ( with opening tag, never return newline then <), missing props on Client components, broken @/ imports, implicit any, and type mismatches between pages and components.
If the build log flags localStorage/sessionStorage usage, replace every occurrence with Prisma server actions or API routes — NEVER store app data in localStorage.
${GENERATED_APP_COMMON_FAILURES_GUIDANCE}
${GENERATED_APP_DEPENDENCY_GUIDANCE}
${GENERATED_APP_TYPESCRIPT_GUIDANCE}
${GENERATED_APP_STYLING_GUIDANCE}
${GENERATED_APP_IMPORT_GUIDANCE}
${GENERATED_APP_COMPONENT_FILES_GUIDANCE}
${GENERATED_APP_PAGE_CLIENT_CONTRACT_GUIDANCE}
${GENERATED_APP_JSX_GUIDANCE}
${GENERATED_APP_DATABASE_GUIDANCE}
${GENERATED_APP_PRISMA_ALIGNMENT_GUIDANCE}
${GENERATED_APP_AUTH_GUIDANCE}
${GENERATED_APP_README_GUIDANCE}
${GENERATED_APP_REPO_SUMMARY_GUIDANCE}
${GENERATED_APP_VALIDATION_GUIDANCE}
Keep the same app purpose and repo name unless a rename is required to fix the build.
Prefer minimal, targeted file changes over rewriting unrelated files.
Do not leave broken imports, invalid JSX, or conflicting app/ and src/app/ directories.`

  const userPrompt = `Original request:\n${userInput}

App name: ${spec.appName}
Repository name: ${spec.repoName}

Build log:
${truncateBuildLog(buildLog)}

Return corrected files that pass npm install && npx tsc --noEmit.`

  const repaired = await requestFullAppSpecFromLlm(repairSystemPrompt, userPrompt, spec.repoName, {
    preserveAllFiles: spec.files.length > MAX_GENERATED_FILES,
  })

  const mergedFiles = mergeEditedFiles(spec.files, repaired.files)

  return normalizeAppSpec(
    {
      ...spec,
      appName: repaired.appName || spec.appName,
      description: repaired.description || spec.description,
      features: repaired.features?.length ? repaired.features : spec.features,
      requiresDatabase: repaired.requiresDatabase ?? spec.requiresDatabase,
      repoName: spec.repoName,
      files: mergedFiles,
    },
    spec.repoName,
    { preserveAllFiles: true, latestUserRequest: userInput }
  )
}

async function writeAppFiles(outputDir: string, files: GeneratedAppFile[]): Promise<number> {
  let written = 0

  for (const file of files) {
    const safePath = sanitizeRelativeFilePath(file.path)
    if (!safePath) {
      logger.warn('Skipping unsafe generated file path', { path: file.path })
      continue
    }

    const fullPath = join(outputDir, safePath)
    await mkdir(dirname(fullPath), { recursive: true })
    await writeFile(fullPath, file.content, 'utf-8')
    written++
  }

  return written
}

interface BuildRepairResult {
  spec: LlmAppSpec
  buildValidated: boolean
  buildOutput: string
  repairRounds: number
}

/**
 * Runs structure validation, TypeScript validation, and repairs with the LLM until checks pass.
 */
async function validateAndRepairUntilTypecheckPasses(
  outputDir: string,
  spec: LlmAppSpec,
  userInput: string
): Promise<BuildRepairResult> {
  let currentSpec = spec
  let buildOutput = ''
  let repairRounds = 0

  for (let round = 0; round <= MAX_BUILD_REPAIR_ROUNDS; round++) {
    currentSpec.requiresDatabase = resolveRequiresDatabase(currentSpec)
    currentSpec.files = normalizeGeneratedAppFiles(currentSpec.files, {
      requiresDatabase: DEVELOPMENT_REQUIRES_DATABASE,
      appName: currentSpec.appName,
      description: currentSpec.description,
      features: currentSpec.features,
      repoName: currentSpec.repoName,
      latestUserRequest: userInput,
    })
    await writeAppFiles(outputDir, currentSpec.files)

    const structureResult = validateGeneratedAppStructure(currentSpec.files, {
      requiresDatabase: DEVELOPMENT_REQUIRES_DATABASE,
    })

    if (!structureResult.valid) {
      buildOutput = `Structure validation failed:\n${formatStructureValidationIssues(structureResult.issues)}`
      logGeneratedAppValidationErrors({
        phase: 'structure',
        round,
        output: buildOutput,
        issues: structureResult.issues,
      })

      if (round >= MAX_BUILD_REPAIR_ROUNDS) {
        break
      }

      repairRounds += 1
      logger.warn('Generated app structure validation failed, requesting LLM repair', {
        round: repairRounds,
        issueCount: structureResult.issues.length,
      })

      currentSpec = await repairAppSpecWithLlm(
        currentSpec,
        `${buildOutput}\n\nFix every structure issue above before TypeScript can pass.`,
        userInput
      )
      continue
    }

    const buildResult = await validateGeneratedAppTypecheck(outputDir, currentSpec.files, {
      requiresDatabase: DEVELOPMENT_REQUIRES_DATABASE,
    })
    buildOutput = `[${buildResult.method}] ${buildResult.output}`

    if (buildResult.validated) {
      return {
        spec: currentSpec,
        buildValidated: true,
        buildOutput,
        repairRounds,
      }
    }

    logGeneratedAppValidationErrors({
      phase: 'typecheck',
      round,
      output: buildResult.output,
    })

    if (round >= MAX_BUILD_REPAIR_ROUNDS) {
      break
    }

    repairRounds += 1
    logger.warn('Generated app TypeScript check failed, requesting LLM repair', {
      round: repairRounds,
      maxRounds: MAX_BUILD_REPAIR_ROUNDS,
    })

    currentSpec = await repairAppSpecWithLlm(currentSpec, buildResult.output, userInput)

    const nextCacheDir = join(outputDir, '.next')
    if (existsSync(nextCacheDir)) {
      await rm(nextCacheDir, { recursive: true, force: true })
    }
  }

  return {
    spec: currentSpec,
    buildValidated: false,
    buildOutput,
    repairRounds,
  }
}

/**
 * Generates a production-ready Next.js app from user input and writes it under generated-apps/.
 */
export async function generateNextjsApp(
  input: GenerateNextjsAppInput
): Promise<GenerateNextjsAppResult> {
  const userInput = input.userInput?.trim()
  if (!userInput) {
    return { success: false, error: 'userInput is required' }
  }

  try {
    const generationStartedAt = Date.now()
    let spec = await generateAppSpecWithLlm(
      userInput,
      input.repoName?.trim(),
      input.referenceImage
    )
    logger.info('LLM app generation finished', {
      durationMs: Date.now() - generationStartedAt,
      fileCount: spec.files.length,
      requiresDatabase: DEVELOPMENT_REQUIRES_DATABASE,
      hasReferenceImage: Boolean(input.referenceImage),
    })

    const repoName = slugifyRepoName(input.repoName?.trim() || spec.repoName)
    const monorepoRoot = findMonorepoRoot()
    const outputDir = join(monorepoRoot, GENERATED_APPS_DIR, repoName)

    await mkdir(outputDir, { recursive: true })
    const fileCount = await writeAppFiles(outputDir, spec.files)

    if (fileCount === 0) {
      return { success: false, error: 'No valid files were written to the output directory' }
    }

    let buildValidated: boolean | undefined
    let buildOutput: string | undefined
    const outputPath = relative(monorepoRoot, outputDir)

    const buildRepair = await validateAndRepairUntilTypecheckPasses(outputDir, spec, userInput)
    spec = buildRepair.spec
    spec.requiresDatabase = DEVELOPMENT_REQUIRES_DATABASE
    buildValidated = buildRepair.buildValidated
    buildOutput = buildRepair.buildOutput

    if (!buildValidated) {
      const errorSummary = formatBuildErrorsSummary(buildOutput ?? '')

      return {
        success: false,
        error: `App validation failed after ${buildRepair.repairRounds} repair round(s):\n${errorSummary || truncateBuildLog(buildOutput ?? '')}`,
        appName: spec.appName,
        repoName,
        description: spec.description,
        features: spec.features,
        outputPath,
        absoluteOutputPath: outputDir,
        fileCount,
        buildValidated: false,
        buildOutput,
      }
    }

    let gitPushed = false
    let githubHtmlUrl: string | undefined
    let githubCloneUrl: string | undefined
    let githubOwner: string | undefined
    let githubRepoName: string | undefined
    let gitPushError: string | undefined

    const {
      githubToken,
      githubOwner: githubOwnerHint,
      vercelToken,
      vercelTeamId,
      neonIntegrationConfigurationId,
      neonApiKey,
      neonOrgId,
    } = resolveDevelopmentDeployEnv()

    let vercelDeployed = false
    let vercelUrl: string | undefined
    let vercelDeploymentUrl: string | undefined
    let vercelProjectId: string | undefined
    let vercelDeploymentId: string | undefined
    let vercelInspectorUrl: string | undefined
    let vercelDeployError: string | undefined
    let databaseProvisioned: boolean | undefined
    let neonProjectId: string | undefined
    let databaseProvisionError: string | undefined
    let preparedVercelProjectName: string | undefined

    if (!githubToken) {
      gitPushError = 'DEVELOPMENT_GITHUB_TOKEN is not set in the environment.'
    } else if (!vercelToken) {
      vercelDeployError = 'DEVELOPMENT_VERCEL_TOKEN is not set in the environment.'
    } else {
      logger.info('Ensuring GitHub repository exists before Vercel setup', { repoName })
      const repoResult = await ensureGitHubRepository({
        repoName,
        description: spec.description,
        githubToken,
        githubOwner: githubOwnerHint,
        privateRepo: input.privateRepo === true,
      })

      if (!repoResult.success || !repoResult.owner || !repoResult.repoName) {
        gitPushError = repoResult.error ?? 'Failed to create or resolve GitHub repository'
        vercelDeployError = gitPushError
      } else {
        githubOwner = repoResult.owner
        githubRepoName = repoResult.repoName
        githubHtmlUrl = repoResult.htmlUrl
        githubCloneUrl = repoResult.cloneUrl

        logger.info('Preparing Vercel project and Neon before git push', { repoName })
        const prepareResult = await prepareVercelProjectForDeploy({
          vercelToken,
          projectName: repoName,
          githubOwner,
          githubRepoName,
          vercelTeamId,
          requiresDatabase: DEVELOPMENT_REQUIRES_DATABASE,
          neonIntegrationConfigurationId,
          neonApiKey,
          neonOrgId,
        })

        vercelProjectId = prepareResult.vercelProjectId
        preparedVercelProjectName = prepareResult.vercelProjectName
        databaseProvisioned = prepareResult.databaseProvisioned
        neonProjectId = prepareResult.neonProjectId
        databaseProvisionError = prepareResult.databaseProvisionError

        if (!prepareResult.success || !vercelProjectId || !preparedVercelProjectName) {
          vercelDeployError = prepareResult.error ?? 'Failed to prepare Vercel project'
        } else {
          const dbPrepareResult = await prepareGeneratedAppForDatabaseDeploy({
            outputDir,
            files: spec.files,
            summaryOptions: {
              appName: spec.appName,
              description: spec.description,
              features: spec.features,
              repoName,
              requiresDatabase: DEVELOPMENT_REQUIRES_DATABASE,
              latestUserRequest: userInput,
              neonProjectId: prepareResult.neonProjectId,
            },
            databaseUrl: prepareResult.databaseUrl,
            neonProjectId: prepareResult.neonProjectId,
            neonApiKey,
          })

          if (dbPrepareResult.error) {
            logger.warn('Database schema sync before deploy failed', {
              repoName,
              error: dbPrepareResult.error,
            })
          }

          logger.info('Pushing generated app to GitHub', { repoName })
          const pushResult = await pushGeneratedAppToGitHub({
            outputDir,
            repoName,
            description: spec.description,
            githubToken,
            githubOwner,
            privateRepo: input.privateRepo === true,
          })
          gitPushed = pushResult.success
          githubHtmlUrl = pushResult.htmlUrl ?? githubHtmlUrl
          githubCloneUrl = pushResult.cloneUrl ?? githubCloneUrl
          githubOwner = pushResult.owner ?? githubOwner
          githubRepoName = pushResult.repoName ?? githubRepoName
          gitPushError = pushResult.error

          if (!gitPushed || !githubOwner || !githubRepoName) {
            vercelDeployError =
              'Vercel deploy requires a successful GitHub push. Check DEVELOPMENT_GITHUB_TOKEN in .env and git push errors.'
          } else {
            logger.info('Deploying to Vercel (can take several minutes)', { repoName })
            const deployResult = await deployPreparedVercelProject({
              vercelToken,
              vercelProjectId,
              vercelProjectName: preparedVercelProjectName,
              githubOwner,
              githubRepoName,
              githubToken,
              outputDir,
              vercelTeamId,
              gitRef: pushResult.defaultBranch ?? 'main',
              gitCommitSha: pushResult.commitSha,
              gitHubRepoId: pushResult.repoId,
              databaseProvisioned,
              neonProjectId,
            })

            vercelDeployed = deployResult.success
            vercelUrl = deployResult.vercelUrl
            vercelDeploymentUrl = deployResult.vercelDeploymentUrl
            vercelProjectId = deployResult.vercelProjectId ?? vercelProjectId
            vercelDeploymentId = deployResult.vercelDeploymentId
            vercelInspectorUrl = deployResult.vercelInspectorUrl
            vercelDeployError = deployResult.error
          }
        }
      }
    }

    if (!vercelDeployed) {
      return {
        success: false,
        error: vercelDeployError ?? 'Vercel deployment failed',
        appName: spec.appName,
        repoName,
        description: spec.description,
        features: spec.features,
        outputPath,
        absoluteOutputPath: outputDir,
        fileCount,
        buildValidated,
        buildOutput,
        gitPushed,
        githubHtmlUrl,
        githubCloneUrl,
        githubOwner,
        githubRepoName,
        gitPushError,
        vercelDeployed: false,
        vercelDeployError,
        requiresDatabase: DEVELOPMENT_REQUIRES_DATABASE,
        databaseProvisioned,
        neonProjectId,
        databaseProvisionError,
      }
    }

    let resolvedAbsoluteOutputPath: string | undefined = outputDir

    const shouldRemoveLocal = gitPushed && vercelDeployed

    if (shouldRemoveLocal) {
      try {
        await rm(outputDir, { recursive: true, force: true })
        resolvedAbsoluteOutputPath = undefined
        logger.info('Removed local generated app folder after publish', { outputDir, repoName })
      } catch (cleanupError) {
        logger.warn('Failed to remove local generated app folder', {
          outputDir,
          error: toError(cleanupError).message,
        })
      }
    }

    logger.info('Next.js app generated', {
      appName: spec.appName,
      repoName,
      outputDir,
      fileCount,
      buildValidated,
      gitPushed,
      githubHtmlUrl,
      vercelDeployed,
      vercelUrl,
      localRemoved: shouldRemoveLocal && !resolvedAbsoluteOutputPath,
    })

    return {
      success: true,
      appName: spec.appName,
      repoName,
      description: spec.description,
      features: spec.features,
      outputPath,
      absoluteOutputPath: resolvedAbsoluteOutputPath,
      fileCount,
      buildValidated,
      buildOutput,
      gitPushed,
      githubHtmlUrl,
      githubCloneUrl,
      githubOwner,
      githubRepoName,
      gitPushError,
      vercelDeployed,
      vercelUrl,
      vercelDeploymentUrl,
      vercelProjectId,
      vercelDeploymentId,
      vercelInspectorUrl,
      vercelDeployError,
      requiresDatabase: DEVELOPMENT_REQUIRES_DATABASE,
      databaseProvisioned,
      neonProjectId,
      databaseProvisionError,
    }
  } catch (error) {
    const message = toError(error).message
    logger.error('Next.js app generation failed', { error: message })
    return { success: false, error: message }
  }
}

export interface EditNextjsAppInput {
  userInput: string
  repoName: string
  referenceImage?: DevelopmentReferenceMedia
}

const EDIT_APP_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    appName: { type: 'string' },
    description: { type: 'string' },
    features: { type: 'array', items: { type: 'string' } },
    requiresDatabase: { type: 'boolean' },
    files: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
    },
  },
  required: ['appName', 'description', 'features', 'requiresDatabase', 'files'],
  additionalProperties: false,
}

const EDIT_APP_SYSTEM_PROMPT = `You are a senior full-stack engineer editing an existing Next.js ${PINNED_NEXT_VERSION} App Router project (React ${PINNED_REACT_VERSION}).

Respond ONLY with JSON matching the provided schema.

Constraints:
- Apply the user's requested changes while preserving working architecture and unrelated code
- Return ONLY files you create or modify (do not echo unchanged files)
- Every returned file must contain complete, real, working code — no stubs or placeholders
- ${GENERATED_APP_COMMON_FAILURES_GUIDANCE}
- ${GENERATED_APP_DEPENDENCY_GUIDANCE}
- ${GENERATED_APP_TYPESCRIPT_GUIDANCE}
- ${GENERATED_APP_STYLING_GUIDANCE}
- ${GENERATED_APP_IMPORT_GUIDANCE}
- ${GENERATED_APP_COMPONENT_FILES_GUIDANCE}
- ${GENERATED_APP_PAGE_CLIENT_CONTRACT_GUIDANCE}
- ${GENERATED_APP_JSX_GUIDANCE}
- ${GENERATED_APP_DATABASE_GUIDANCE}
- ${GENERATED_APP_PRISMA_ALIGNMENT_GUIDANCE}
- ${GENERATED_APP_AUTH_GUIDANCE}
- ${GENERATED_APP_DATABASE_EDIT_GUIDANCE}
- When editing prisma/schema.prisma you MUST return lib/actions.ts and lib/types.ts in the same response — aligned includes, t.field access, and DTO field names
- When editing prisma/schema.prisma or lib/types.ts, keep exports in sync — export every type from lib/types.ts and import it with \`import type\` in components; import server actions (not types) from lib/actions.ts
- ${GENERATED_APP_README_GUIDANCE}
- ${GENERATED_APP_REPO_SUMMARY_GUIDANCE}
- Read REPO_SUMMARY.md in the user message before editing — it is the primary architecture reference
- Do not return REPO_SUMMARY.md unless you must fix it manually; Sim regenerates it after your edits
- ${GENERATED_APP_VALIDATION_GUIDANCE}
- NEVER use localStorage.setItem or sessionStorage.setItem to persist app data
- Valid TypeScript, zero build errors, no secrets`

function mergeEditedFiles(
  existingFiles: GeneratedAppFile[],
  editedFiles: GeneratedAppFile[]
): GeneratedAppFile[] {
  const byPath = new Map<string, GeneratedAppFile>()
  for (const file of existingFiles) {
    byPath.set(file.path.replace(/\\/g, '/'), file)
  }
  for (const file of editedFiles) {
    byPath.set(file.path.replace(/\\/g, '/'), file)
  }
  return [...byPath.values()]
}

function inferAppMetadataFromFiles(
  repoName: string,
  existingFiles: GeneratedAppFile[]
): Pick<LlmAppSpec, 'appName' | 'description' | 'features' | 'requiresDatabase'> {
  const readme = existingFiles.find((file) => file.path === 'README.md')?.content ?? ''
  const packageJsonFile = existingFiles.find((file) => file.path === 'package.json')
  let appName = repoName
  if (packageJsonFile) {
    try {
      const parsed = JSON.parse(packageJsonFile.content) as { name?: string }
      if (parsed.name) {
        appName = parsed.name
      }
    } catch {
      // ignore invalid package.json
    }
  }

  const description =
    readme
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0)
      ?.replace(/^#\s*/, '') ?? `Edited ${repoName}`

  return {
    appName,
    description,
    features: [],
    requiresDatabase: resolveRequiresDatabase({
      requiresDatabase: undefined,
      files: existingFiles,
    }),
  }
}

function buildEditReferenceContext(
  repoName: string,
  metadata: Pick<LlmAppSpec, 'appName' | 'description' | 'features' | 'requiresDatabase'>,
  existingFiles: GeneratedAppFile[]
): string {
  const summaryOptions = {
    appName: metadata.appName,
    description: metadata.description,
    features: metadata.features,
    repoName,
    requiresDatabase: metadata.requiresDatabase,
  }

  const filesWithSummary = ensureRepoSummaryFile(existingFiles, summaryOptions)
  const repoSummary =
    filesWithSummary.find((file) => file.path === GENERATED_APP_REPO_SUMMARY_PATH)?.content ??
    buildRepoSummaryContent(filesWithSummary, summaryOptions)

  const supplementalPaths = [
    'prisma/schema.prisma',
    'lib/types.ts',
    'lib/actions.ts',
    'lib/auth.ts',
  ]
  const supplementalFiles = existingFiles
    .filter((file) => supplementalPaths.includes(file.path.replace(/\\/g, '/')))
    .map((file) => `--- ${file.path} ---\n${file.content}`)
    .join('\n\n')

  const fileIndex = existingFiles
    .map((file) => file.path.replace(/\\/g, '/'))
    .sort()
    .join('\n')

  const supplementalSection = supplementalFiles
    ? `\n\nKey shared files (for schema/types/actions context):\n${supplementalFiles}`
    : ''

  return `Repository summary (read this first — primary reference for architecture, routes, and scope):

${repoSummary}

Complete file index (${existingFiles.length} paths):
${fileIndex}${supplementalSection}`
}

async function requestAppEditsFromLlm(
  userInput: string,
  repoName: string,
  existingFiles: GeneratedAppFile[],
  referenceImage?: DevelopmentReferenceMedia
): Promise<LlmAppSpec> {
  const anthropic = createDevelopmentAnthropicClient(getAnthropicApiKey())
  const metadata = inferAppMetadataFromFiles(repoName, existingFiles)

  const editReference = buildEditReferenceContext(repoName, metadata, existingFiles)

  const userPrompt = `Repository: ${repoName}
App name: ${metadata.appName}
Description: ${metadata.description}

${editReference}

User edit request:
${userInput}

Return JSON with app metadata and ONLY the files you changed or added.`

  const parsed = await requestStructuredJsonWithContinuations(
    anthropic,
    EDIT_APP_SYSTEM_PROMPT,
    userPrompt,
    EDIT_APP_JSON_SCHEMA,
    (text) => JSON.parse(extractJsonFromLlmText(text)) as LlmAppSpec,
    referenceImage
  )

  if (!parsed.files?.length) {
    throw new Error('LLM did not return any file changes for the edit request')
  }

  const mergedFiles = mergeEditedFiles(existingFiles, parsed.files)

  return normalizeAppSpec(
    {
      appName: parsed.appName || metadata.appName,
      repoName,
      description: parsed.description || metadata.description,
      features: parsed.features?.length ? parsed.features : metadata.features,
      requiresDatabase: parsed.requiresDatabase ?? metadata.requiresDatabase,
      files: mergedFiles,
    },
    repoName,
    { preserveAllFiles: true, latestUserRequest: userInput }
  )
}

/**
 * Edits an existing generated Next.js app from user instructions, then validates, pushes, and deploys.
 */
export async function editNextjsApp(input: EditNextjsAppInput): Promise<GenerateNextjsAppResult> {
  const userInput = input.userInput?.trim()
  const repoName = slugifyRepoName(input.repoName?.trim() ?? '')

  if (!userInput) {
    return { success: false, error: 'userInput is required' }
  }
  if (!repoName) {
    return { success: false, error: 'repoName is required' }
  }

  try {
    const { ensureLocalGeneratedApp } = await import('@/lib/development/ensure-local-generated-app')
    const { readGeneratedAppFiles } = await import('@/lib/development/read-generated-app-files')
    const {
      ensureGitHubRepository,
      pushRepoChangesToGitHub,
    } = await import('@/lib/development/push-generated-app-to-github')

    const localResult = await ensureLocalGeneratedApp(repoName)
    if (!localResult.success || !localResult.outputDir) {
      return { success: false, error: localResult.error ?? 'Failed to prepare local repository copy' }
    }

    const outputDir = localResult.outputDir
    const monorepoRoot = findMonorepoRoot()
    const outputPath = relative(monorepoRoot, outputDir)

    const existingFiles = await readGeneratedAppFiles(outputDir)
    const generationStartedAt = Date.now()
    let spec = await requestAppEditsFromLlm(userInput, repoName, existingFiles, input.referenceImage)
    logger.info('LLM app edit finished', {
      durationMs: Date.now() - generationStartedAt,
      changedFiles: spec.files.length,
      requiresDatabase: DEVELOPMENT_REQUIRES_DATABASE,
      hasReferencePdf: Boolean(input.referenceImage),
    })

    const fileCount = await writeAppFiles(outputDir, spec.files)
    if (fileCount === 0) {
      return { success: false, error: 'No valid files were written to the output directory' }
    }

    let buildValidated: boolean | undefined
    let buildOutput: string | undefined

    const buildRepair = await validateAndRepairUntilTypecheckPasses(outputDir, spec, userInput)
    spec = buildRepair.spec
    spec.requiresDatabase = DEVELOPMENT_REQUIRES_DATABASE
    buildValidated = buildRepair.buildValidated
    buildOutput = buildRepair.buildOutput

    if (!buildValidated) {
      const errorSummary = formatBuildErrorsSummary(buildOutput ?? '')
      return {
        success: false,
        error: `App validation failed after edit (${buildRepair.repairRounds} repair round(s)):\n${errorSummary || truncateBuildLog(buildOutput ?? '')}`,
        appName: spec.appName,
        repoName,
        description: spec.description,
        features: spec.features,
        outputPath,
        absoluteOutputPath: outputDir,
        fileCount,
        buildValidated: false,
        buildOutput,
      }
    }

    let gitPushed = false
    let githubHtmlUrl = localResult.githubHtmlUrl
    let githubCloneUrl = localResult.githubCloneUrl
    let githubOwner = localResult.githubOwner
    let githubRepoName = localResult.githubRepoName ?? repoName
    let gitPushError: string | undefined

    const {
      githubToken,
      githubOwner: githubOwnerHint,
      vercelToken,
      vercelTeamId,
      neonIntegrationConfigurationId,
      neonApiKey,
      neonOrgId,
    } = resolveDevelopmentDeployEnv()

    let vercelDeployed = false
    let vercelUrl: string | undefined
    let vercelDeploymentUrl: string | undefined
    let vercelProjectId: string | undefined
    let vercelDeploymentId: string | undefined
    let vercelInspectorUrl: string | undefined
    let vercelDeployError: string | undefined
    let databaseProvisioned: boolean | undefined
    let neonProjectId: string | undefined
    let databaseProvisionError: string | undefined

    if (!githubToken) {
      gitPushError = 'DEVELOPMENT_GITHUB_TOKEN is not set in the environment.'
    } else if (!vercelToken) {
      vercelDeployError = 'DEVELOPMENT_VERCEL_TOKEN is not set in the environment.'
    } else {
      logger.info('Ensuring GitHub repository exists before Vercel setup (edit)', { repoName })
      const repoResult = await ensureGitHubRepository({
        repoName,
        description: spec.description,
        githubToken,
        githubOwner: githubOwnerHint ?? githubOwner,
      })

      if (!repoResult.success || !repoResult.owner || !repoResult.repoName) {
        gitPushError = repoResult.error ?? 'Failed to resolve GitHub repository for edit'
        vercelDeployError = gitPushError
      } else {
        githubOwner = repoResult.owner
        githubRepoName = repoResult.repoName
        githubHtmlUrl = repoResult.htmlUrl ?? githubHtmlUrl
        githubCloneUrl = repoResult.cloneUrl ?? githubCloneUrl

        logger.info('Preparing Vercel project before edit push', { repoName })
        const prepareResult = await prepareVercelProjectForDeploy({
          vercelToken,
          projectName: repoName,
          githubOwner,
          githubRepoName,
          vercelTeamId,
          requiresDatabase: DEVELOPMENT_REQUIRES_DATABASE,
          neonIntegrationConfigurationId,
          neonApiKey,
          neonOrgId,
        })

        vercelProjectId = prepareResult.vercelProjectId
        databaseProvisioned = prepareResult.databaseProvisioned
        neonProjectId = prepareResult.neonProjectId
        databaseProvisionError = prepareResult.databaseProvisionError

        if (!prepareResult.success || !vercelProjectId || !prepareResult.vercelProjectName) {
          vercelDeployError = prepareResult.error ?? 'Failed to prepare Vercel project'
        } else {
          const dbPrepareResult = await prepareGeneratedAppForDatabaseDeploy({
            outputDir,
            files: spec.files,
            summaryOptions: {
              appName: spec.appName,
              description: spec.description,
              features: spec.features,
              repoName,
              requiresDatabase: DEVELOPMENT_REQUIRES_DATABASE,
              latestUserRequest: userInput,
              neonProjectId: prepareResult.neonProjectId,
            },
            databaseUrl: prepareResult.databaseUrl,
            neonProjectId: prepareResult.neonProjectId,
            neonApiKey,
          })

          if (dbPrepareResult.error) {
            logger.warn('Database schema sync before edit deploy failed', {
              repoName,
              error: dbPrepareResult.error,
            })
          }

          logger.info('Pushing edited app to GitHub', { repoName })
          const pushResult = await pushRepoChangesToGitHub({
            outputDir,
            repoName,
            githubToken,
            githubOwner,
            commitMessage: `${userInput.slice(0, 72)}`,
          })

          gitPushed = pushResult.success && pushResult.pushed === true
          githubHtmlUrl = pushResult.htmlUrl ?? githubHtmlUrl
          githubCloneUrl = pushResult.cloneUrl ?? githubCloneUrl
          githubOwner = pushResult.owner ?? githubOwner
          githubRepoName = pushResult.repoName ?? githubRepoName
          gitPushError = pushResult.error

          if (!gitPushed || !githubOwner || !githubRepoName || !pushResult.commitSha) {
            vercelDeployError =
              gitPushError ??
              'Vercel deploy requires a successful GitHub push with a new commit. Check DEVELOPMENT_GITHUB_TOKEN in .env and git push errors.'
          } else {
            logger.info('Deploying edited app to Vercel', {
              repoName,
              commitSha: pushResult.commitSha,
              repoId: pushResult.repoId,
            })
            const deployResult = await deployPreparedVercelProject({
              vercelToken,
              vercelProjectId,
              vercelProjectName: prepareResult.vercelProjectName,
              githubOwner,
              githubRepoName,
              githubToken,
              outputDir,
              vercelTeamId,
              gitRef: pushResult.defaultBranch ?? 'main',
              gitCommitSha: pushResult.commitSha,
              gitHubRepoId: pushResult.repoId,
              databaseProvisioned,
              neonProjectId,
            })

            vercelDeployed = deployResult.success
            vercelUrl = deployResult.vercelUrl
            vercelDeploymentUrl = deployResult.vercelDeploymentUrl
            vercelProjectId = deployResult.vercelProjectId ?? vercelProjectId
            vercelDeploymentId = deployResult.vercelDeploymentId
            vercelInspectorUrl = deployResult.vercelInspectorUrl
            vercelDeployError = deployResult.error
          }
        }
      }
    }

    if (!vercelDeployed) {
      return {
        success: false,
        error: vercelDeployError ?? 'Vercel deployment failed after edit',
        appName: spec.appName,
        repoName,
        description: spec.description,
        features: spec.features,
        outputPath,
        absoluteOutputPath: outputDir,
        fileCount,
        buildValidated,
        buildOutput,
        gitPushed,
        githubHtmlUrl,
        githubCloneUrl,
        githubOwner,
        githubRepoName,
        gitPushError,
        vercelDeployed: false,
        vercelDeployError,
        requiresDatabase: DEVELOPMENT_REQUIRES_DATABASE,
        databaseProvisioned,
        neonProjectId,
        databaseProvisionError,
      }
    }

    let resolvedAbsoluteOutputPath: string | undefined = outputDir
    const shouldRemoveLocal = gitPushed && vercelDeployed

    if (shouldRemoveLocal) {
      try {
        await rm(outputDir, { recursive: true, force: true })
        resolvedAbsoluteOutputPath = undefined
        logger.info('Removed local generated app folder after edit publish', { outputDir, repoName })
      } catch (cleanupError) {
        logger.warn('Failed to remove local generated app folder after edit', {
          outputDir,
          error: toError(cleanupError).message,
        })
      }
    }

    return {
      success: true,
      appName: spec.appName,
      repoName,
      description: spec.description,
      features: spec.features,
      outputPath,
      absoluteOutputPath: resolvedAbsoluteOutputPath,
      fileCount,
      buildValidated,
      buildOutput,
      gitPushed,
      githubHtmlUrl,
      githubCloneUrl,
      githubOwner,
      githubRepoName,
      gitPushError,
      vercelDeployed,
      vercelUrl,
      vercelDeploymentUrl,
      vercelProjectId,
      vercelDeploymentId,
      vercelInspectorUrl,
      vercelDeployError,
      requiresDatabase: DEVELOPMENT_REQUIRES_DATABASE,
      databaseProvisioned,
      neonProjectId,
      databaseProvisionError,
      mode: 'edit',
    }
  } catch (error) {
    const message = toError(error).message
    logger.error('Next.js app edit failed', { error: message, repoName })
    return { success: false, error: message }
  }
}

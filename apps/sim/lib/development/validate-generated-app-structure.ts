import { createLogger } from '@sim/logger'
import type { GeneratedAppFile } from '@/lib/development/normalize-generated-app-files'
import {
  collectJsxPropNamesForComponent,
  GENERATED_APP_DATABASE_FILE_PATHS,
} from '@/lib/development/normalize-generated-app-files'

const logger = createLogger('ValidateGeneratedAppStructure')

export interface ValidateGeneratedAppStructureOptions {
  requiresDatabase?: boolean
}

export interface ValidateGeneratedAppStructureResult {
  valid: boolean
  issues: string[]
}

const ALIAS_IMPORT_PATTERNS = [
  /from\s+['"]@\/([^'"]+)['"]/g,
  /import\s*\(\s*['"]@\/([^'"]+)['"]\s*\)/g,
  /import\s+['"]@\/([^'"]+)['"]/g,
]

const CLIENT_HOOK_PATTERNS = [
  /\buseState\s*\(/,
  /\buseEffect\s*\(/,
  /\buseCallback\s*\(/,
  /\buseMemo\s*\(/,
  /\buseRef\s*\(/,
  /\buseReducer\s*\(/,
  /\buseContext\s*\(/,
  /\buseTransition\s*\(/,
  /\buseId\s*\(/,
  /\bonClick\s*=/,
  /\bonChange\s*=/,
  /\bonSubmit\s*=/,
]

const TAILWIND_CONFIG_PATHS = ['tailwind.config.ts', 'tailwind.config.js', 'tailwind.config.mjs'] as const

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function projectUsesSrcAppDir(files: GeneratedAppFile[]): boolean {
  return files.some((file) => normalizePath(file.path).startsWith('src/app/'))
}

function resolveAliasToCandidatePaths(importPath: string, useSrcDir: boolean): string[] {
  const prefix = useSrcDir ? 'src/' : ''
  const base = `${prefix}${importPath.replace(/\/$/, '')}`
  const componentCandidates = [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]
  const moduleCandidates = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]

  if (
    importPath.startsWith('lib/') ||
    importPath.startsWith('hooks/') ||
    importPath.startsWith('utils/') ||
    importPath.startsWith('types/')
  ) {
    return moduleCandidates
  }

  return importPath.startsWith('components/') ? componentCandidates : moduleCandidates
}

function collectAliasImports(content: string): string[] {
  const imports: string[] = []
  for (const pattern of ALIAS_IMPORT_PATTERNS) {
    for (const match of content.matchAll(pattern)) {
      if (match[1]) {
        imports.push(match[1])
      }
    }
  }
  return imports
}

function toComponentName(filePath: string): string {
  const base = filePath.split('/').pop() ?? 'Component'
  const withoutExt = base.replace(/\.(tsx|ts|jsx|js)$/, '') || 'Component'
  return withoutExt
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('')
}

function componentAcceptsProps(content: string, componentName: string): boolean {
  return (
    new RegExp(`export\\s+function\\s+${componentName}\\s*\\(\\s*\\{`, 'm').test(content) ||
    new RegExp(`export\\s+default\\s+function\\s+${componentName}\\s*\\(\\s*\\{`, 'm').test(content) ||
    new RegExp(`export\\s+(?:function|default\\s+function)\\s+${componentName}\\s*\\([^)]+:`, 'm').test(
      content
    )
  )
}

function findUseClientDirectiveIndex(content: string): number {
  const singleQuote = content.indexOf("'use client'")
  const doubleQuote = content.indexOf('"use client"')
  if (singleQuote < 0) {
    return doubleQuote
  }
  if (doubleQuote < 0) {
    return singleQuote
  }
  return Math.min(singleQuote, doubleQuote)
}

function fileRequiresUseClient(content: string, filePath: string): boolean {
  if (!/\.tsx$/.test(filePath)) {
    return false
  }

  if (filePath.startsWith('components/')) {
    return CLIENT_HOOK_PATTERNS.some((pattern) => pattern.test(content))
  }

  return CLIENT_HOOK_PATTERNS.some((pattern) => pattern.test(content))
}

function checkMissingImportFiles(files: GeneratedAppFile[]): string[] {
  const useSrcDir = projectUsesSrcAppDir(files)
  const pathSet = new Set(files.map((file) => normalizePath(file.path)))
  const issues: string[] = []

  for (const file of files) {
    if (!/\.(tsx|ts|jsx|js|mjs|cjs)$/.test(file.path)) {
      continue
    }

    for (const importPath of collectAliasImports(file.content)) {
      const candidates = resolveAliasToCandidatePaths(importPath, useSrcDir)
      if (!candidates.some((candidate) => pathSet.has(candidate))) {
        issues.push(`Missing file for import @/${importPath} (referenced in ${file.path})`)
      }
    }
  }

  return issues
}

function checkMissingPropsInterfaces(files: GeneratedAppFile[]): string[] {
  const issues: string[] = []

  for (const file of files) {
    const path = normalizePath(file.path)
    if (!path.startsWith('components/') || !path.endsWith('.tsx')) {
      continue
    }

    const componentName = toComponentName(path)
    const propNames = collectJsxPropNamesForComponent(componentName, files)
    if (propNames.length === 0) {
      continue
    }

    if (!componentAcceptsProps(file.content, componentName)) {
      issues.push(
        `${path}: component ${componentName} is rendered with props (${propNames.join(', ')}) but has no matching props interface`
      )
    }
  }

  return issues
}

function checkUseClientPlacement(files: GeneratedAppFile[]): string[] {
  const issues: string[] = []

  for (const file of files) {
    const path = normalizePath(file.path)
    if (!/\.(tsx|ts)$/.test(path)) {
      continue
    }

    const content = file.content
    const useClientIndex = findUseClientDirectiveIndex(content)
    const hasUseClient = useClientIndex >= 0

    if (hasUseClient) {
      const beforeDirective = content.slice(0, useClientIndex).trim()
      if (beforeDirective.length > 0) {
        issues.push(`${path}: "use client" must be the first statement in the file`)
      }

      if (/^lib\/(actions|prisma|types)\.ts$/.test(path)) {
        issues.push(`${path}: server modules must not include "use client"`)
      }
    }

    if (fileRequiresUseClient(content, path) && !hasUseClient) {
      issues.push(`${path}: uses client hooks or event handlers but is missing "use client"`)
    }
  }

  return issues
}

function readPackageJson(files: GeneratedAppFile[]): {
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
} | null {
  const packageFile = files.find((file) => normalizePath(file.path) === 'package.json')
  if (!packageFile) {
    return null
  }

  try {
    return JSON.parse(packageFile.content) as {
      scripts?: Record<string, string>
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }
  } catch {
    return null
  }
}

function checkPrismaUsage(
  files: GeneratedAppFile[],
  requiresDatabase: boolean
): string[] {
  const pathSet = new Set(files.map((file) => normalizePath(file.path)))
  const issues: string[] = []
  const pkg = readPackageJson(files)

  const hasPrismaSchema = pathSet.has('prisma/schema.prisma')
  const hasPrismaClient = pathSet.has('lib/prisma.ts')
  const hasPrismaDep =
    Boolean(pkg?.dependencies?.['@prisma/client']) || Boolean(pkg?.devDependencies?.prisma)

  if (requiresDatabase) {
    for (const requiredPath of GENERATED_APP_DATABASE_FILE_PATHS) {
      if (!pathSet.has(requiredPath)) {
        issues.push(`Database app is missing required file: ${requiredPath}`)
      }
    }
    if (!hasPrismaDep) {
      issues.push('Database app package.json is missing @prisma/client and/or prisma dependencies')
    }
    return issues
  }

  if (hasPrismaSchema || hasPrismaClient) {
    issues.push('Non-database app must not include Prisma files (prisma/schema.prisma, lib/prisma.ts)')
  }

  if (hasPrismaDep) {
    issues.push('Non-database app package.json must not include @prisma/client or prisma dependencies')
  }

  return issues
}

function checkTailwindConfig(files: GeneratedAppFile[]): string[] {
  const pathSet = new Set(files.map((file) => normalizePath(file.path)))
  if (TAILWIND_CONFIG_PATHS.some((path) => pathSet.has(path))) {
    return []
  }

  return ['Missing Tailwind config (expected tailwind.config.ts)']
}

function checkBuildScript(files: GeneratedAppFile[]): string[] {
  const pkg = readPackageJson(files)
  if (!pkg) {
    return ['Missing package.json']
  }

  const buildScript = pkg.scripts?.build?.trim()
  if (!buildScript) {
    return ['package.json is missing scripts.build']
  }

  return []
}

/**
 * Validates generated app structure after normalization.
 */
export function validateGeneratedAppStructure(
  files: GeneratedAppFile[],
  options: ValidateGeneratedAppStructureOptions = {}
): ValidateGeneratedAppStructureResult {
  const requiresDatabase = options.requiresDatabase === true
  const issues = [
    ...checkMissingImportFiles(files),
    ...checkMissingPropsInterfaces(files),
    ...checkUseClientPlacement(files),
    ...checkPrismaUsage(files, requiresDatabase),
    ...checkTailwindConfig(files),
    ...checkBuildScript(files),
  ]

  if (issues.length > 0) {
    logger.warn('Generated app structure validation failed', { issueCount: issues.length })
    for (const issue of issues) {
      logger.error(issue)
    }
  } else {
    logger.info('Generated app structure validation passed')
  }

  return {
    valid: issues.length === 0,
    issues,
  }
}

/**
 * Formats structure validation issues for LLM repair prompts.
 */
export function formatStructureValidationIssues(issues: string[]): string {
  return issues.map((issue, index) => `${index + 1}. ${issue}`).join('\n')
}

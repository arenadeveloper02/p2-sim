import { createLogger } from '@sim/logger'

const logger = createLogger('NormalizeGeneratedApp')

export interface GeneratedAppFile {
  path: string
  content: string
}

/** Latest stable releases aligned with the Sim monorepo (Next 16 + React 19). */
export const PINNED_NEXT_VERSION = '16.2.7'
export const PINNED_REACT_VERSION = '19.2.7'

const PINNED_DEV_DEPENDENCIES: Record<string, string> = {
  typescript: '^5.8.3',
  '@types/node': '^22.13.10',
  '@types/react': '^19.1.8',
  '@types/react-dom': '^19.1.6',
  tailwindcss: '^3.4.17',
  postcss: '^8.5.3',
  autoprefixer: '^10.4.21',
  eslint: '^9.28.0',
  'eslint-config-next': PINNED_NEXT_VERSION,
}

const PINNED_DEPENDENCIES: Record<string, string> = {
  next: PINNED_NEXT_VERSION,
  react: PINNED_REACT_VERSION,
  'react-dom': PINNED_REACT_VERSION,
}

export const GENERATED_APP_DEPENDENCY_GUIDANCE = `package.json MUST pin these exact versions:
- "next": "${PINNED_NEXT_VERSION}"
- "react": "${PINNED_REACT_VERSION}"
- "react-dom": "${PINNED_REACT_VERSION}"
- devDependencies: typescript ^5.8, @types/node ^22, @types/react ^19, @types/react-dom ^19, tailwindcss ^3.4.17, postcss ^8, autoprefixer ^10, eslint ^9, eslint-config-next ${PINNED_NEXT_VERSION}
Use Tailwind CSS v3 only (tailwind.config.ts + postcss.config.mjs with tailwindcss and autoprefixer). Do NOT use Tailwind v4-only setup.
next.config.ts MUST NOT include an eslint property (removed in Next.js 16 — builds no longer run ESLint from next.config)`

export const GENERATED_APP_TYPESCRIPT_GUIDANCE = `TypeScript and Next.js structure (zero errors required):
- Use strict TypeScript: strict true in tsconfig.json, no @ts-ignore, no implicit any, no unused variables
- Every React component props interface must be explicit (e.g. interface HeroProps { title: string })
- Use Next.js 16 App Router only: app/layout.tsx (root layout with html/body), app/page.tsx, app/globals.css, and app/<route>/page.tsx for pages
- Do NOT mix app/ and src/app/ — use app/ at project root only; path alias "@/*" maps to "./*" in tsconfig paths
- Default to Server Components; add "use client" only for hooks, browser APIs, or event handlers
- Use next/link for internal navigation, next/image for images, export const metadata in layout/page where appropriate
- All imports must resolve; no missing modules; prefer named exports for components under components/
- Code MUST pass "npm install && npm run build" with zero TypeScript errors and zero Next.js compile errors`

export const GENERATED_APP_IMPORT_GUIDANCE = `Imports and modules (critical for Vercel build):
- tsconfig paths MUST be "@/*": ["./*"] with app/ at project root (not src/app/)
- EVERY import from "@/..." MUST have a matching file in the generated files list
- If app/layout.tsx imports Footer from "@/components/Footer", you MUST include components/Footer.tsx (same for Navbar, ContactForm, Hero, etc.)
- Do not import components, lib, or hooks that you did not generate
- Prefer default exports in components/ (export default function Footer) matching the import style in pages
- Pages should only import files that exist in the project; run a mental checklist: layout + every page imports ⊆ files array`

export const GENERATED_APP_STYLING_GUIDANCE = `Fonts and CSS:
- NEVER use @import url('https://fonts.googleapis.com/...') or any external font CDN URL in .css files
- NEVER add <link rel="stylesheet" href="https://fonts.googleapis.com/..."> in layout or components
- Load fonts ONLY with next/font/google in app/layout.tsx (e.g. Inter from 'next/font/google'), export const inter = Inter({ subsets: ['latin'] }), apply inter.className on <body>
- Reference the font via Tailwind (font-sans on body) or CSS variables from next/font — not remote @import`

const GOOGLE_FONTS_IMPORT_PATTERN =
  /@import\s+url\s*\(\s*['"]https:\/\/fonts\.googleapis\.com[^'"]*['"]\s*\)\s*;?/gi

const GOOGLE_FONTS_LINK_PATTERN =
  /<link[^>]*href\s*=\s*['"]https:\/\/fonts\.googleapis\.com[^'"]*['"][^>]*>\s*/gi

/**
 * Removes Google Fonts CDN @import and <link> tags from generated source.
 */
export function stripExternalGoogleFontReferences(content: string): string {
  const stripped = content
    .replace(GOOGLE_FONTS_IMPORT_PATTERN, '')
    .replace(GOOGLE_FONTS_LINK_PATTERN, '')
    .replace(/\n{3,}/g, '\n\n')

  return stripped.endsWith('\n') || stripped.length === 0 ? stripped : `${stripped}\n`
}

function shouldSanitizeFontReferences(path: string): boolean {
  return (
    path.endsWith('.css') ||
    path.endsWith('.tsx') ||
    path.endsWith('.ts') ||
    path.endsWith('.jsx') ||
    path.endsWith('.js')
  )
}

/**
 * Pins package.json to current Next.js/React and compatible tooling.
 */
export function patchPackageJsonContent(content: string): string {
  try {
    const pkg = JSON.parse(content) as {
      dependencies?: Record<string, string>
      devDependencies?: Record<string, string>
    }

    pkg.dependencies = { ...pkg.dependencies, ...PINNED_DEPENDENCIES }
    pkg.devDependencies = { ...pkg.devDependencies, ...PINNED_DEV_DEPENDENCIES }

    return `${JSON.stringify(pkg, null, 2)}\n`
  } catch {
    return content
  }
}

const NEXT_CONFIG_ESLINT_BLOCK_PATTERN = /\s*eslint:\s*\{[\s\S]*?\},?\n?/g

/**
 * Removes the deprecated eslint block from next.config (invalid on Next.js 16+ NextConfig).
 */
export function patchNextConfigContent(content: string): string {
  return content.replace(NEXT_CONFIG_ESLINT_BLOCK_PATTERN, '\n').replace(/\n{3,}/g, '\n\n')
}

/**
 * Aligns tsconfig with Next 16 + strict TypeScript and the chosen app directory layout.
 */
export function patchTsconfigContent(content: string, useSrcDir: boolean): string {
  try {
    const tsconfig = JSON.parse(content) as {
      compilerOptions?: Record<string, unknown>
      include?: string[]
      exclude?: string[]
    }

    tsconfig.compilerOptions = {
      lib: ['dom', 'dom.iterable', 'esnext'],
      allowJs: true,
      skipLibCheck: true,
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
      jsx: 'preserve',
      incremental: true,
      plugins: [{ name: 'next' }],
      ...tsconfig.compilerOptions,
      paths: {
        '@/*': [useSrcDir ? './src/*' : './*'],
      },
    }

    tsconfig.include = tsconfig.include ?? [
      'next-env.d.ts',
      '**/*.ts',
      '**/*.tsx',
      '.next/types/**/*.ts',
    ]
    tsconfig.exclude = tsconfig.exclude ?? ['node_modules']

    return `${JSON.stringify(tsconfig, null, 2)}\n`
  } catch {
    return content
  }
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function projectUsesSrcAppDir(files: GeneratedAppFile[]): boolean {
  return files.some((file) => normalizePath(file.path).startsWith('src/app/'))
}

const ALIAS_IMPORT_PATTERNS = [
  /from\s+['"]@\/([^'"]+)['"]/g,
  /import\s*\(\s*['"]@\/([^'"]+)['"]\s*\)/g,
  /import\s+['"]@\/([^'"]+)['"]/g,
]

function resolveAliasToCandidatePaths(importPath: string, useSrcDir: boolean): string[] {
  const prefix = useSrcDir ? 'src/' : ''
  const base = `${prefix}${importPath.replace(/\/$/, '')}`
  return [`${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`]
}

function collectAliasImportsFromSource(content: string): string[] {
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
  return base.replace(/\.(tsx|ts|jsx|js)$/, '') || 'Component'
}

function createStubComponentFile(filePath: string): GeneratedAppFile {
  const name = toComponentName(filePath)
  const isClient =
    /form|modal|menu|dropdown|toggle|carousel|slider|tabs/i.test(name) ||
    /Form|Modal|Menu|Dropdown/.test(name)

  const content = `${isClient ? "'use client'\n\n" : ''}/** Auto-generated stub so @/ imports resolve on Vercel. Replace with full UI when refining the app. */
export default function ${name}() {
  return (
    <section className="py-8">
      <div className="mx-auto max-w-5xl px-4 text-sm text-slate-600">${name}</div>
    </section>
  )
}
`

  return { path: filePath, content }
}

/**
 * Ensures every @/ import in generated sources has a matching file (adds stubs if the model omitted them).
 */
export function reconcileMissingAliasImports(
  files: GeneratedAppFile[],
  useSrcDir = false
): GeneratedAppFile[] {
  const normalized = files.map((f) => ({ ...f, path: normalizePath(f.path) }))
  const pathSet = new Set(normalized.map((f) => f.path))
  const neededImports = new Set<string>()

  for (const file of normalized) {
    if (!/\.(tsx|ts|jsx|js|mjs|cjs)$/.test(file.path)) {
      continue
    }
    for (const importPath of collectAliasImportsFromSource(file.content)) {
      neededImports.add(importPath)
    }
  }

  const stubs: GeneratedAppFile[] = []

  for (const importPath of neededImports) {
    const candidates = resolveAliasToCandidatePaths(importPath, useSrcDir)
    if (candidates.some((candidate) => pathSet.has(candidate))) {
      continue
    }

    const stubPath = candidates[0]
    const stub = createStubComponentFile(stubPath)
    stubs.push(stub)
    pathSet.add(stubPath)
  }

  if (stubs.length > 0) {
    logger.warn('Added stub files for missing @/ imports', {
      paths: stubs.map((stub) => stub.path),
    })
  }

  return stubs.length > 0 ? [...normalized, ...stubs] : normalized
}

/**
 * Normalizes generated files for reliable local and Vercel builds.
 */
export function normalizeGeneratedAppFiles(files: GeneratedAppFile[]): GeneratedAppFile[] {
  const useSrcDir = projectUsesSrcAppDir(files)

  const patched = files.map((file) => {
    const path = normalizePath(file.path)

    if (path === 'package.json' || path.endsWith('/package.json')) {
      return { ...file, content: patchPackageJsonContent(file.content) }
    }

    if (path === 'next.config.ts' || path === 'next.config.mjs' || path === 'next.config.js') {
      return { ...file, content: patchNextConfigContent(file.content) }
    }

    if (path === 'tsconfig.json' || path.endsWith('/tsconfig.json')) {
      return { ...file, content: patchTsconfigContent(file.content, useSrcDir) }
    }

    if (shouldSanitizeFontReferences(path)) {
      return { ...file, content: stripExternalGoogleFontReferences(file.content) }
    }

    return file
  })

  return reconcileMissingAliasImports(patched, useSrcDir)
}

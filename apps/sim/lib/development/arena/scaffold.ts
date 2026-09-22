import { createLogger } from '@sim/logger'
import { SIM_TOKENS_CSS, SIM_TOKENS_CSS_PATH } from '@/lib/development/arena/sim-tokens-css'

const logger = createLogger('ArenaDevelopmentScaffold')

export const ARENA_EMAIL_COOKIE_NAME = 'arena_email_id'
export const ARENA_THEME_COOKIE_NAME = 'arena_theme'
export const ARENA_ACCESS_DENIED_MESSAGE = 'Do not have access'
export const ARENA_DEFAULT_THEME = 'light' as const

interface GeneratedAppFile {
  path: string
  content: string
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/')
}

function projectUsesSrcAppDir(files: GeneratedAppFile[]): boolean {
  return files.some((file) => normalizePath(file.path).startsWith('src/app/'))
}

function arenaPaths(useSrcDir: boolean) {
  const prefix = useSrcDir ? 'src/' : ''
  return {
    middleware: useSrcDir ? 'src/middleware.ts' : 'middleware.ts',
    arenaEmailConstants: `${prefix}lib/arena-email-constants.ts`,
    arenaEmail: `${prefix}lib/arena-email.ts`,
    emailProvider: `${prefix}components/arena-email-provider.tsx`,
    themeProvider: `${prefix}components/arena-theme-provider.tsx`,
    accessDeniedPage: useSrcDir ? 'src/app/access-denied/page.tsx' : 'app/access-denied/page.tsx',
    layout: useSrcDir ? 'src/app/layout.tsx' : 'app/layout.tsx',
    globalsCss: useSrcDir ? 'src/app/globals.css' : 'app/globals.css',
    simTokensCss: useSrcDir ? `src/${SIM_TOKENS_CSS_PATH}` : SIM_TOKENS_CSS_PATH,
  } as const
}

function buildMiddlewareContent(): string {
  return `import { type NextRequest, NextResponse } from 'next/server'
import {
  ARENA_EMAIL_COOKIE_NAME,
  ARENA_THEME_COOKIE_NAME,
  normalizeArenaTheme,
} from '@/lib/arena-email-constants'

const COOKIE_OPTIONS = {
  path: '/',
  secure: true,
  sameSite: 'none' as const,
  httpOnly: true,
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const frameHeaders = {
    'Content-Security-Policy': 'frame-ancestors *',
  } as const

  const themeFromQuery = request.nextUrl.searchParams.get('theme')?.trim() ?? ''
  const themeFromCookie = request.cookies.get(ARENA_THEME_COOKIE_NAME)?.value?.trim() ?? ''
  const theme = normalizeArenaTheme(themeFromQuery || themeFromCookie)

  const applyThemeCookie = (response: NextResponse) => {
    if (themeFromQuery) {
      response.cookies.set(ARENA_THEME_COOKIE_NAME, theme, COOKIE_OPTIONS)
    } else if (!themeFromCookie) {
      response.cookies.set(ARENA_THEME_COOKIE_NAME, theme, COOKIE_OPTIONS)
    }
  }

  if (pathname === '/access-denied' || pathname.startsWith('/access-denied/')) {
    const response = NextResponse.next()
    response.headers.set('Content-Security-Policy', frameHeaders['Content-Security-Policy'])
    applyThemeCookie(response)
    return response
  }

  const fromQuery = request.nextUrl.searchParams.get('emailId')?.trim() ?? ''
  const fromCookie = request.cookies.get(ARENA_EMAIL_COOKIE_NAME)?.value?.trim() ?? ''
  const emailId = fromQuery || fromCookie

  if (!emailId) {
    const deniedUrl = request.nextUrl.clone()
    deniedUrl.pathname = '/access-denied'
    deniedUrl.search = ''
    const response = NextResponse.rewrite(deniedUrl)
    response.headers.set('Content-Security-Policy', frameHeaders['Content-Security-Policy'])
    applyThemeCookie(response)
    return response
  }

  const response = NextResponse.next()
  response.headers.set('Content-Security-Policy', frameHeaders['Content-Security-Policy'])
  applyThemeCookie(response)

  if (fromQuery) {
    response.cookies.set(ARENA_EMAIL_COOKIE_NAME, fromQuery, COOKIE_OPTIONS)
  }

  return response
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\\\..*).*)'],
}
`
}

function buildAccessDeniedPageContent(): string {
  return `import { ARENA_ACCESS_DENIED_MESSAGE } from '@/lib/arena-email-constants'

/**
 * Shown when the Arena iframe is opened without a valid emailId.
 * Uses Sim UI tokens; respects \`?theme=\` / arena_theme cookie via root layout.
 */
export default function AccessDeniedPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg)] px-6 py-8">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_color-mix(in_srgb,var(--brand-500)_12%,transparent)_0%,_transparent_55%)]"
      />

      <section className="relative w-full max-w-[440px] rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-8 shadow-sm">
        <div className="mb-6 flex size-14 items-center justify-center rounded-lg bg-[var(--surface-5)] text-[var(--brand-500)]">
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="size-7"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            <circle cx="12" cy="16" r="1.25" fill="currentColor" stroke="none" />
          </svg>
        </div>

        <p className="mb-2 text-xs font-medium tracking-wide text-[var(--brand-500)]">Arena</p>
        <h1 className="text-2xl font-semibold leading-8 text-[var(--text-primary)]">
          {ARENA_ACCESS_DENIED_MESSAGE}
        </h1>
        <p className="mt-3 text-base leading-6 text-[var(--text-secondary)]">
          This experience only opens from a valid Arena invite link. Ask your host to resend the
          link that includes your email access token.
        </p>

        <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--surface-3)] px-4 py-3">
          <p className="text-xs leading-4 tracking-wide text-[var(--text-muted)]">
            Missing or empty{' '}
            <span className="font-medium text-[var(--text-secondary)]">emailId</span> in the iframe
            URL. Theme still follows <span className="font-medium text-[var(--text-secondary)]">theme</span>{' '}
            when present (default light / white).
          </p>
        </div>
      </section>
    </main>
  )
}
`
}

function buildArenaEmailConstantsContent(): string {
  return `export const ARENA_EMAIL_COOKIE_NAME = '${ARENA_EMAIL_COOKIE_NAME}'
export const ARENA_THEME_COOKIE_NAME = '${ARENA_THEME_COOKIE_NAME}'
export const ARENA_ACCESS_DENIED_MESSAGE = '${ARENA_ACCESS_DENIED_MESSAGE}'
export const ARENA_DEFAULT_THEME = '${ARENA_DEFAULT_THEME}' as const

export type ArenaTheme = 'light' | 'dark'

/**
 * Normalizes iframe \`?theme=\` / cookie values. \`white\` and \`light\` → light; \`dark\` → dark;
 * anything else (including empty) → light (white default).
 */
export function normalizeArenaTheme(raw: string | null | undefined): ArenaTheme {
  const value = raw?.trim().toLowerCase() ?? ''
  if (value === 'dark') return 'dark'
  return 'light'
}
`
}

function buildArenaEmailLibContent(): string {
  return `import { cookies } from 'next/headers'
import {
  ARENA_ACCESS_DENIED_MESSAGE,
  ARENA_DEFAULT_THEME,
  ARENA_EMAIL_COOKIE_NAME,
  ARENA_THEME_COOKIE_NAME,
  normalizeArenaTheme,
  type ArenaTheme,
} from '@/lib/arena-email-constants'

export {
  ARENA_ACCESS_DENIED_MESSAGE,
  ARENA_DEFAULT_THEME,
  ARENA_EMAIL_COOKIE_NAME,
  ARENA_THEME_COOKIE_NAME,
  normalizeArenaTheme,
  type ArenaTheme,
} from '@/lib/arena-email-constants'

/**
 * Reads the Arena email id from the httpOnly cookie (set by middleware from ?emailId=).
 */
export async function getArenaEmailId(): Promise<string | null> {
  const jar = await cookies()
  const value = jar.get(ARENA_EMAIL_COOKIE_NAME)?.value?.trim()
  return value || null
}

/**
 * Returns the Arena email id or throws when missing.
 */
export async function requireArenaEmailId(): Promise<string> {
  const emailId = await getArenaEmailId()
  if (!emailId) {
    throw new Error(ARENA_ACCESS_DENIED_MESSAGE)
  }
  return emailId
}

/**
 * Reads theme from the httpOnly cookie (set by middleware from ?theme=). Defaults to light.
 */
export async function getArenaTheme(): Promise<ArenaTheme> {
  const jar = await cookies()
  const value = jar.get(ARENA_THEME_COOKIE_NAME)?.value
  return normalizeArenaTheme(value || ARENA_DEFAULT_THEME)
}
`
}

function buildArenaEmailProviderContent(): string {
  return `'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { ARENA_ACCESS_DENIED_MESSAGE } from '@/lib/arena-email-constants'

const ArenaEmailContext = createContext<string | null>(null)

interface ArenaEmailProviderProps {
  emailId?: string | null
  /** @deprecated Prefer \`emailId\` — accepted for LLM prop-name drift (Context-style \`value\`). */
  value?: string | null
  children: ReactNode
}

/**
 * Provides the Arena iframe emailId to client components.
 */
export function ArenaEmailProvider({ emailId, value, children }: ArenaEmailProviderProps) {
  const resolved = emailId ?? value ?? null
  return <ArenaEmailContext.Provider value={resolved}>{children}</ArenaEmailContext.Provider>
}

/**
 * Client hook for the Arena email id. Throws when unavailable.
 */
export function useArenaEmailId(): string {
  const emailId = useContext(ArenaEmailContext)
  if (!emailId) {
    throw new Error(ARENA_ACCESS_DENIED_MESSAGE)
  }
  return emailId
}

/**
 * Optional client hook when a page can render without an email id.
 */
export function useOptionalArenaEmailId(): string | null {
  return useContext(ArenaEmailContext)
}
`
}

function buildArenaThemeProviderContent(): string {
  return `'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { ArenaTheme } from '@/lib/arena-email-constants'

const ArenaThemeContext = createContext<ArenaTheme>('light')

interface ArenaThemeProviderProps {
  theme?: ArenaTheme
  /** @deprecated Prefer \`theme\` — accepted for LLM prop-name drift. */
  initialTheme?: ArenaTheme
  children: ReactNode
}

/**
 * Provides the Arena iframe theme (from ?theme= / cookie) to client components.
 */
export function ArenaThemeProvider({ theme, initialTheme, children }: ArenaThemeProviderProps) {
  const value = theme ?? initialTheme ?? 'light'
  return <ArenaThemeContext.Provider value={value}>{children}</ArenaThemeContext.Provider>
}

/**
 * Client hook for the active Arena theme (\`light\` or \`dark\`).
 */
export function useArenaTheme(): ArenaTheme {
  return useContext(ArenaThemeContext)
}
`
}

/**
 * Removes import statements that pull Arena scaffold symbols from any module so
 * re-wiring is idempotent. Handles single- and multi-line imports and either quote style.
 * Prevents TS2300 Duplicate identifier when the LLM already wired providers.
 */
function stripArenaLayoutImports(content: string): string {
  // Full import blocks from known Arena modules (including multi-line).
  let next = content.replace(
    /^import\s+(?:type\s+)?(?:\{[\s\S]*?\}|\*\s+as\s+\w+|\w+)\s+from\s+['"]@\/(?:components\/(?:arena-email-provider|arena-theme-provider|ArenaProviders)|lib\/arena-email)['"]\s*;?\s*\n?/gm,
    ''
  )

  // Any remaining import that binds scaffold symbols from a custom barrel.
  next = next.replace(
    /^import\s+(?:type\s+)?\{[\s\S]*?\b(?:ArenaEmailProvider|ArenaThemeProvider|getArenaEmailId|getArenaTheme)\b[\s\S]*?\}\s+from\s+['"][^'"]+['"]\s*;?\s*\n?/gm,
    ''
  )

  return next
}

/**
 * Ensures root layout wires email + theme providers and sets html class from theme.
 * Idempotent — safe when the LLM already imported/wired the same symbols (any quote style).
 */
export function ensureArenaProvidersInLayout(content: string): string {
  let next = stripArenaLayoutImports(content)

  const canonicalImports = [
    "import { getArenaEmailId, getArenaTheme } from '@/lib/arena-email'",
    "import { ArenaEmailProvider } from '@/components/arena-email-provider'",
    "import { ArenaThemeProvider } from '@/components/arena-theme-provider'",
  ].join('\n')

  next = `${canonicalImports}\n${next.trimStart()}`

  // Drop Poppins / Arena font forcing — Sim UI uses system defaults.
  next = next.replace(
    /import\s*\{\s*Poppins\s*\}\s*from\s*['"]next\/font\/google['"]\s*\n*/g,
    ''
  )
  next = next.replace(/const\s+poppins\s*=\s*Poppins\s*\([^)]*\)\s*\n*/g, '')

  next = next.replace(
    /export\s+default\s+(?:async\s+)?function\s+(\w+)/,
    'export default async function $1'
  )

  if (!/const\s+emailId\s*=\s*await\s+getArenaEmailId\s*\(/.test(next)) {
    next = next.replace(
      /(export default async function \w+\s*\([^)]*\)\s*(?::\s*[^{]+)?\{)/,
      '$1\n  const emailId = await getArenaEmailId()\n'
    )
  }

  if (!/const\s+theme\s*=\s*await\s+getArenaTheme\s*\(/.test(next)) {
    next = next.replace(
      /(const\s+emailId\s*=\s*await\s+getArenaEmailId\s*\(\s*\))/,
      '$1\n  const theme = await getArenaTheme()'
    )
  }

  // Normalize LLM prop-name drift on Arena providers.
  next = next.replace(
    /(<ArenaThemeProvider\b[^>]*?)\binitialTheme=/g,
    '$1theme='
  )
  next = next.replace(/(<ArenaEmailProvider\b[^>]*?)\bvalue=/g, '$1emailId=')

  // Ensure <html> carries light|dark class from theme.
  if (/<html([^>]*)>/.test(next)) {
    if (!next.includes('className={theme}') && !next.includes('className={`${theme}')) {
      next = next.replace(/<html([^>]*)>/, (_match, attrs: string) => {
        const cleaned = attrs
          .replace(/\s*className=\{[^}]+\}/g, '')
          .replace(/\s*className="[^"]*"/g, '')
        return `<html${cleaned} className={theme}>`
      })
    }
  }

  // Nest providers around children — only if missing.
  if (!next.includes('<ArenaThemeProvider') || !next.includes('<ArenaEmailProvider')) {
    next = next.replace(
      /\{children\}/g,
      '<ArenaThemeProvider theme={theme}><ArenaEmailProvider emailId={emailId}>{children}</ArenaEmailProvider></ArenaThemeProvider>'
    )
  } else if (next.includes('<ArenaEmailProvider') && !next.includes('<ArenaThemeProvider')) {
    next = next.replace(
      /<ArenaEmailProvider([^>]*)>([\s\S]*?)<\/ArenaEmailProvider>/,
      '<ArenaThemeProvider theme={theme}><ArenaEmailProvider$1>$2</ArenaEmailProvider></ArenaThemeProvider>'
    )
  }

  // Body should use Sim surface tokens when possible.
  if (/<body([^>]*)>/.test(next) && !next.includes('bg-[var(--bg)]')) {
    next = next.replace(/<body([^>]*)>/, (_match, attrs: string) => {
      const withoutClass = attrs
        .replace(/\s*className=\{[^}]+\}/g, '')
        .replace(/\s*className="[^"]*"/g, '')
      return `<body${withoutClass} className="min-h-screen bg-[var(--bg)] text-[var(--text-body)] antialiased">`
    })
  }

  return ensureNextMetadataImport(next)
}

/**
 * Ensures `import type { Metadata } from 'next'` when the layout references Metadata.
 * LLM layouts often export \`const metadata: Metadata\` without the import; Arena
 * rewiring prepends imports and leaves that TS2304 intact through repair rounds.
 */
function ensureNextMetadataImport(content: string): string {
  if (!/\bMetadata\b/.test(content)) {
    return content
  }

  if (/import\s+(?:type\s+)?\{[^}]*\bMetadata\b[^}]*\}\s*from\s*['"]next['"]/.test(content)) {
    return content
  }

  const importLine = "import type { Metadata } from 'next'"
  const afterArenaTheme =
    /import\s+\{\s*ArenaThemeProvider\s*\}\s+from\s+['"]@\/components\/arena-theme-provider['"]\s*;?\s*\n/
  if (afterArenaTheme.test(content)) {
    return content.replace(afterArenaTheme, (match) => `${match}${importLine}\n`)
  }

  return `${importLine}\n${content.trimStart()}`
}

/** @deprecated Use {@link ensureArenaProvidersInLayout} */
export function ensureArenaEmailProviderInLayout(content: string): string {
  return ensureArenaProvidersInLayout(content)
}

/**
 * Ensures globals.css imports Sim tokens (and drops legacy Arena DS import).
 */
export function ensureSimTokensImportInGlobals(content: string): string {
  let next = content.replace(/@import\s+['"]\.\/arena-ds-tokens\.css['"];?\s*\n?/g, '')

  if (next.includes('sim-tokens.css')) {
    return next
  }

  const importLine = "@import './sim-tokens.css';\n"
  if (next.trimStart().startsWith('@tailwind')) {
    return `${importLine}${next}`
  }
  return `${importLine}${next}`
}

/** @deprecated Use {@link ensureSimTokensImportInGlobals} */
export function ensureArenaDsTokensImportInGlobals(content: string): string {
  return ensureSimTokensImportInGlobals(content)
}

function upsertFile(files: GeneratedAppFile[], path: string, content: string): GeneratedAppFile[] {
  const normalized = normalizePath(path)
  const index = files.findIndex((file) => normalizePath(file.path) === normalized)
  if (index === -1) {
    return [...files, { path: normalized, content }]
  }

  const next = [...files]
  next[index] = { path: normalized, content }
  return next
}

/**
 * Rewrites LLM prop-name drift on Arena providers across all TSX files.
 */
function normalizeArenaProviderPropNames(content: string): string {
  return content
    .replace(/(<ArenaThemeProvider\b[^>]*?)\binitialTheme=/g, '$1theme=')
    .replace(/(<ArenaEmailProvider\b[^>]*?)\bvalue=/g, '$1emailId=')
}

/**
 * Injects Arena iframe emailId + theme middleware, Sim tokens, helpers, and layout wiring.
 */
export function ensureArenaScaffoldFiles(files: GeneratedAppFile[]): GeneratedAppFile[] {
  const useSrcDir = projectUsesSrcAppDir(files)
  const paths = arenaPaths(useSrcDir)

  let result = files.map((file) => {
    const path = normalizePath(file.path)
    if (!/\.(tsx|jsx)$/.test(path)) {
      return file
    }
    const next = normalizeArenaProviderPropNames(file.content)
    return next === file.content ? file : { ...file, content: next }
  })
  result = upsertFile(result, paths.middleware, buildMiddlewareContent())
  result = upsertFile(result, paths.arenaEmailConstants, buildArenaEmailConstantsContent())
  result = upsertFile(result, paths.arenaEmail, buildArenaEmailLibContent())
  result = upsertFile(result, paths.emailProvider, buildArenaEmailProviderContent())
  result = upsertFile(result, paths.themeProvider, buildArenaThemeProviderContent())
  result = upsertFile(result, paths.accessDeniedPage, buildAccessDeniedPageContent())
  result = upsertFile(result, paths.simTokensCss, SIM_TOKENS_CSS)

  // Drop legacy Arena DS token file and LLM-invented provider barrels.
  result = result.filter((file) => {
    const path = normalizePath(file.path)
    if (path.endsWith('arena-ds-tokens.css')) return false
    if (/(^|\/)components\/ArenaProviders\.tsx$/.test(path)) return false
    return true
  })

  const globalsIndex = result.findIndex((file) => normalizePath(file.path) === paths.globalsCss)
  if (globalsIndex === -1) {
    result = upsertFile(
      result,
      paths.globalsCss,
      ensureSimTokensImportInGlobals(
        '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n'
      )
    )
  } else {
    const patchedGlobals = ensureSimTokensImportInGlobals(result[globalsIndex].content)
    result = upsertFile(result, paths.globalsCss, patchedGlobals)
  }

  const layoutIndex = result.findIndex((file) => normalizePath(file.path) === paths.layout)
  if (layoutIndex === -1) {
    logger.warn('Arena scaffold: root layout missing; skipping provider wiring', {
      layout: paths.layout,
    })
    return result
  }

  const patchedLayout = ensureArenaProvidersInLayout(result[layoutIndex].content)
  if (patchedLayout !== result[layoutIndex].content) {
    logger.info('Arena scaffold: wired email + theme providers into root layout', {
      layout: paths.layout,
    })
  }

  return upsertFile(result, paths.layout, patchedLayout)
}

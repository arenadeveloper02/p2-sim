import { createLogger } from '@sim/logger'
import {
  ARENA_DS_TOKENS_CSS,
  ARENA_DS_TOKENS_CSS_PATH,
} from '@/lib/development/arena/ds-tokens-css'

const logger = createLogger('ArenaDevelopmentScaffold')

export const ARENA_EMAIL_COOKIE_NAME = 'arena_email_id'
export const ARENA_ACCESS_DENIED_MESSAGE = 'Do not have access'

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
    provider: `${prefix}components/arena-email-provider.tsx`,
    accessDeniedPage: useSrcDir ? 'src/app/access-denied/page.tsx' : 'app/access-denied/page.tsx',
    layout: useSrcDir ? 'src/app/layout.tsx' : 'app/layout.tsx',
    globalsCss: useSrcDir ? 'src/app/globals.css' : 'app/globals.css',
    dsTokensCss: useSrcDir ? `src/${ARENA_DS_TOKENS_CSS_PATH}` : ARENA_DS_TOKENS_CSS_PATH,
  } as const
}

function buildMiddlewareContent(): string {
  return `import { type NextRequest, NextResponse } from 'next/server'
import { ARENA_EMAIL_COOKIE_NAME } from '@/lib/arena-email-constants'

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const frameHeaders = {
    'Content-Security-Policy': 'frame-ancestors *',
  } as const

  if (pathname === '/access-denied' || pathname.startsWith('/access-denied/')) {
    const response = NextResponse.next()
    response.headers.set('Content-Security-Policy', frameHeaders['Content-Security-Policy'])
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
    return response
  }

  const response = NextResponse.next()
  response.headers.set('Content-Security-Policy', frameHeaders['Content-Security-Policy'])

  if (fromQuery) {
    response.cookies.set(ARENA_EMAIL_COOKIE_NAME, fromQuery, {
      path: '/',
      secure: true,
      sameSite: 'none',
      httpOnly: true,
    })
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
 */
export default function AccessDeniedPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--ds-color-surface-subtle)] px-[var(--ds-spacing-component-lg)] py-[var(--ds-spacing-layout-md)]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--ds-color-brand-surface)_0%,_transparent_55%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 top-1/3 size-64 rounded-full bg-[var(--ds-color-brand-default)] opacity-[0.06] blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 bottom-1/4 size-56 rounded-full bg-[var(--ds-color-brand-default)] opacity-[0.08] blur-3xl"
      />

      <section
        className="relative w-full max-w-[440px] rounded-[var(--ds-radius-lg)] border border-[var(--ds-color-border-default)] bg-[var(--ds-color-surface-raised)] p-[var(--ds-spacing-component-xl)] shadow-[var(--ds-elevation-md)]"
        style={{
          animation: 'arena-access-in var(--ds-motion-duration-slow) var(--ds-motion-easing-decelerate) both',
        }}
      >
        <div className="mb-[var(--ds-spacing-component-lg)] flex size-14 items-center justify-center rounded-[var(--ds-radius-md)] bg-[var(--ds-color-brand-surface)] text-[var(--ds-color-brand-default)]">
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

        <p className="mb-[var(--ds-spacing-component-xs)] text-xs font-medium tracking-wide text-[var(--ds-color-text-link)]">
          Arena
        </p>
        <h1 className="text-[length:var(--ds-type-heading-font-size)] font-semibold leading-[var(--ds-type-heading-line-height)] text-[var(--ds-color-text-primary)]">
          {ARENA_ACCESS_DENIED_MESSAGE}
        </h1>
        <p className="mt-[var(--ds-spacing-component-sm)] text-[length:var(--ds-type-body-font-size)] leading-[var(--ds-type-body-line-height)] text-[var(--ds-color-text-secondary)]">
          This experience only opens from a valid Arena invite link. Ask your host to resend the
          link that includes your email access token.
        </p>

        <div className="mt-[var(--ds-spacing-component-lg)] rounded-[var(--ds-radius-sm)] border border-[var(--ds-color-border-subtle)] bg-[var(--ds-color-surface-subtle)] px-[var(--ds-spacing-component-md)] py-[var(--ds-spacing-component-sm)]">
          <p className="text-[length:var(--ds-type-caption-font-size)] leading-[var(--ds-type-caption-line-height)] tracking-wide text-[var(--ds-color-text-tertiary)]">
            Missing or empty{' '}
            <span className="font-medium text-[var(--ds-color-text-secondary)]">emailId</span> in
            the iframe URL.
          </p>
        </div>
      </section>

      <style>{\`
        @keyframes arena-access-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      \`}</style>
    </main>
  )
}
`
}

function buildArenaEmailConstantsContent(): string {
  return `export const ARENA_EMAIL_COOKIE_NAME = '${ARENA_EMAIL_COOKIE_NAME}'
export const ARENA_ACCESS_DENIED_MESSAGE = '${ARENA_ACCESS_DENIED_MESSAGE}'
`
}

function buildArenaEmailLibContent(): string {
  return `import { cookies } from 'next/headers'
import {
  ARENA_ACCESS_DENIED_MESSAGE,
  ARENA_EMAIL_COOKIE_NAME,
} from '@/lib/arena-email-constants'

export {
  ARENA_ACCESS_DENIED_MESSAGE,
  ARENA_EMAIL_COOKIE_NAME,
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
`
}

function buildArenaEmailProviderContent(): string {
  return `'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { ARENA_ACCESS_DENIED_MESSAGE } from '@/lib/arena-email-constants'

const ArenaEmailContext = createContext<string | null>(null)

interface ArenaEmailProviderProps {
  emailId: string | null
  children: ReactNode
}

/**
 * Provides the Arena iframe emailId to client components.
 */
export function ArenaEmailProvider({ emailId, children }: ArenaEmailProviderProps) {
  return <ArenaEmailContext.Provider value={emailId}>{children}</ArenaEmailContext.Provider>
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

/**
 * Ensures root layout wraps children with ArenaEmailProvider and loads emailId on the server.
 */
export function ensureArenaEmailProviderInLayout(content: string): string {
  if (
    content.includes('ArenaEmailProvider') &&
    content.includes('getArenaEmailId') &&
    content.includes('emailId={emailId}')
  ) {
    return content
  }

  let next = content

  if (!next.includes("from '@/components/arena-email-provider'")) {
    next = `import { ArenaEmailProvider } from '@/components/arena-email-provider'\n${next}`
  }
  if (!next.includes("from '@/lib/arena-email'")) {
    next = `import { getArenaEmailId } from '@/lib/arena-email'\n${next}`
  }

  if (!next.includes("from 'next/font/google'") && !next.includes('Poppins')) {
    next = `import { Poppins } from 'next/font/google'\n\nconst poppins = Poppins({ subsets: ['latin'], weight: ['400', '500', '600', '700'] })\n${next}`
  }

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

  if (!next.includes('<ArenaEmailProvider')) {
    next = next.replace(
      /\{children\}/g,
      '<ArenaEmailProvider emailId={emailId}>{children}</ArenaEmailProvider>'
    )
  }

  if (next.includes('poppins') && /<body([^>]*)>/.test(next) && !next.includes('poppins.className')) {
    next = next.replace(/<body([^>]*)>/, '<body$1 className={poppins.className}>')
  }

  return next
}

/**
 * Ensures globals.css imports the Arena DS tokens stylesheet.
 */
export function ensureArenaDsTokensImportInGlobals(content: string): string {
  if (content.includes('arena-ds-tokens.css')) {
    return content
  }

  const importLine = "@import './arena-ds-tokens.css';\n"
  if (content.trimStart().startsWith('@tailwind')) {
    return `${importLine}${content}`
  }
  return `${importLine}${content}`
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
 * Injects Arena iframe emailId middleware, helpers, provider, layout wiring, and DS tokens.
 */
export function ensureArenaScaffoldFiles(files: GeneratedAppFile[]): GeneratedAppFile[] {
  const useSrcDir = projectUsesSrcAppDir(files)
  const paths = arenaPaths(useSrcDir)

  let result = files
  result = upsertFile(result, paths.middleware, buildMiddlewareContent())
  result = upsertFile(result, paths.arenaEmailConstants, buildArenaEmailConstantsContent())
  result = upsertFile(result, paths.arenaEmail, buildArenaEmailLibContent())
  result = upsertFile(result, paths.provider, buildArenaEmailProviderContent())
  result = upsertFile(result, paths.accessDeniedPage, buildAccessDeniedPageContent())
  result = upsertFile(result, paths.dsTokensCss, ARENA_DS_TOKENS_CSS)

  const globalsIndex = result.findIndex((file) => normalizePath(file.path) === paths.globalsCss)
  if (globalsIndex === -1) {
    result = upsertFile(result, paths.globalsCss, ensureArenaDsTokensImportInGlobals('@tailwind base;\n@tailwind components;\n@tailwind utilities;\n'))
  } else {
    const patchedGlobals = ensureArenaDsTokensImportInGlobals(result[globalsIndex].content)
    result = upsertFile(result, paths.globalsCss, patchedGlobals)
  }

  const layoutIndex = result.findIndex((file) => normalizePath(file.path) === paths.layout)
  if (layoutIndex === -1) {
    logger.warn('Arena scaffold: root layout missing; skipping provider wiring', {
      layout: paths.layout,
    })
    return result
  }

  const patchedLayout = ensureArenaEmailProviderInLayout(result[layoutIndex].content)
  if (patchedLayout !== result[layoutIndex].content) {
    logger.info('Arena scaffold: wired ArenaEmailProvider into root layout', {
      layout: paths.layout,
    })
  }

  return upsertFile(result, paths.layout, patchedLayout)
}

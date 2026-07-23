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
    layout: useSrcDir ? 'src/app/layout.tsx' : 'app/layout.tsx',
    globalsCss: useSrcDir ? 'src/app/globals.css' : 'app/globals.css',
    dsTokensCss: useSrcDir ? `src/${ARENA_DS_TOKENS_CSS_PATH}` : ARENA_DS_TOKENS_CSS_PATH,
  } as const
}

function buildMiddlewareContent(): string {
  return `import { type NextRequest, NextResponse } from 'next/server'
import {
  ARENA_ACCESS_DENIED_MESSAGE,
  ARENA_EMAIL_COOKIE_NAME,
} from '@/lib/arena-email-constants'

export function middleware(request: NextRequest) {
  const fromQuery = request.nextUrl.searchParams.get('emailId')?.trim() ?? ''
  const fromCookie = request.cookies.get(ARENA_EMAIL_COOKIE_NAME)?.value?.trim() ?? ''
  const emailId = fromQuery || fromCookie

  const frameHeaders = {
    'Content-Security-Policy': 'frame-ancestors *',
  } as const

  if (!emailId) {
    return new NextResponse(ARENA_ACCESS_DENIED_MESSAGE, {
      status: 403,
      headers: {
        ...frameHeaders,
        'content-type': 'text/plain; charset=utf-8',
      },
    })
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

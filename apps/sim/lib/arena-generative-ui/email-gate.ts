import { cookies } from 'next/headers'
import { ARENA_EMAIL_COOKIE_NAME } from '@/lib/arena-generative-ui/types'
import { isDev } from '@/lib/core/config/env-flags'

export {
  ARENA_ACCESS_DENIED_MESSAGE,
  ARENA_EMAIL_COOKIE_NAME,
} from '@/lib/arena-generative-ui/types'

/**
 * Reads emailId from the query string or the Arena iframe cookie.
 */
export function resolveArenaEmailId(options: {
  searchParams: Record<string, string | string[] | undefined>
  cookieValue?: string | null
}): string {
  const raw = options.searchParams.emailId
  const fromQuery = Array.isArray(raw) ? raw[0] : raw
  const queryValue = fromQuery?.trim() ?? ''
  if (queryValue) {
    return queryValue
  }
  return options.cookieValue?.trim() ?? ''
}

/**
 * Server-side emailId for App Router pages.
 */
export async function getArenaEmailIdFromRequest(searchParams: {
  emailId?: string | string[]
}): Promise<{ emailId: string; fromQuery: boolean }> {
  const raw = searchParams.emailId
  const fromQuery = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? ''
  if (fromQuery) {
    return { emailId: fromQuery, fromQuery: true }
  }
  const store = await cookies()
  return { emailId: store.get(ARENA_EMAIL_COOKIE_NAME)?.value?.trim() ?? '', fromQuery: false }
}

/**
 * Persists Arena iframe emailId so later same-origin navigations keep the gate.
 */
export async function persistArenaEmailIdCookie(emailId: string): Promise<void> {
  const trimmed = emailId.trim()
  if (!trimmed) return
  const store = await cookies()
  store.set({
    name: ARENA_EMAIL_COOKIE_NAME,
    value: trimmed,
    httpOnly: true,
    secure: !isDev,
    sameSite: isDev ? 'lax' : 'none',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
}

/**
 * Reads Arena emailId from a NextRequest cookie, query string, or action body.
 */
export function resolveArenaEmailIdFromRequest(
  request: {
    cookies: { get: (name: string) => { value: string } | undefined }
    nextUrl: { searchParams: URLSearchParams }
  },
  bodyEmailId?: string
): string {
  const fromBody = bodyEmailId?.trim() ?? ''
  if (fromBody) return fromBody
  const fromQuery = request.nextUrl.searchParams.get('emailId')?.trim() ?? ''
  if (fromQuery) return fromQuery
  return request.cookies.get(ARENA_EMAIL_COOKIE_NAME)?.value?.trim() ?? ''
}

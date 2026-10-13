import type { Metadata } from 'next'
import { getEnv } from '@/lib/core/config/env'
import { SessionRequiredContent } from '@/app/session-required/session-required-content'

export const metadata: Metadata = {
  title: 'Sign in required',
}

export const dynamic = 'force-dynamic'

interface SessionRequiredPageProps {
  searchParams: Promise<{ returnTo?: string | string[] }>
}

function firstParam(value: string | string[] | undefined): string | undefined {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value[0]
  return undefined
}

/** Only allow same-origin absolute URLs or app-relative paths as returnTo. */
function sanitizeReturnTo(raw: string | undefined, appBase: string | undefined): string | undefined {
  if (!raw?.trim()) return undefined
  const candidate = raw.trim()
  if (candidate.startsWith('/') && !candidate.startsWith('//')) {
    if (!appBase) return undefined
    try {
      return new URL(candidate, `${appBase.replace(/\/$/, '')}/`).href
    } catch {
      return undefined
    }
  }
  if (!appBase) return undefined
  try {
    const appOrigin = new URL(appBase).origin
    const parsed = new URL(candidate)
    if (parsed.origin !== appOrigin) return undefined
    return parsed.href
  } catch {
    return undefined
  }
}

export default async function SessionRequiredPage({ searchParams }: SessionRequiredPageProps) {
  const arenaUrl = getEnv('NEXT_PUBLIC_ARENA_FRONTEND_APP_URL')?.trim()
  const appBase = getEnv('NEXT_PUBLIC_APP_URL')?.trim()
  const params = await searchParams
  const returnTo = sanitizeReturnTo(firstParam(params.returnTo), appBase)

  return <SessionRequiredContent arenaUrl={arenaUrl} returnTo={returnTo} />
}

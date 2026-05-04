import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { getEnv } from '@/lib/core/config/env'
import { SessionRequiredContent } from '@/app/session-required/session-required-content'

export const metadata: Metadata = {
  title: 'Sign in required',
}

export const dynamic = 'force-dynamic'

export default async function SessionRequiredPage() {
  const cookieStore = await cookies()
  const hasEmailCookie = !!cookieStore.get('email')?.value
  const arenaUrl = getEnv('NEXT_PUBLIC_ARENA_FRONTEND_APP_URL')?.trim()

  return <SessionRequiredContent arenaUrl={arenaUrl} hasEmailCookie={hasEmailCookie} />
}

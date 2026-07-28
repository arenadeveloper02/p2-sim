import { db } from '@sim/db'
import { user } from '@sim/db/schema'
import { eq } from 'drizzle-orm'

/**
 * Resolves the signed-in user's email for copilot allowlist checks.
 * Falls back to the database when the session omits email.
 */
export async function resolveUserEmailForCopilot(
  userId: string,
  sessionEmail?: string | null
): Promise<string | undefined> {
  const fromSession = typeof sessionEmail === 'string' ? sessionEmail.trim() : ''
  if (fromSession) return fromSession

  const [row] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  const fromDb = row?.email?.trim()
  return fromDb || undefined
}

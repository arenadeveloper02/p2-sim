import { db } from '@sim/db'
import { user, userArenaDetails } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import { isClientUser } from '@/lib/users/is-client-user'

/**
 * Loads Arena user type and email for a Sim user id, then returns whether they are a client user.
 */
export async function lookupIsClientUserForUserId(
  userId: string | null | undefined
): Promise<boolean> {
  const id = typeof userId === 'string' ? userId.trim() : ''
  if (!id) return false

  const [row] = await db
    .select({
      email: user.email,
      userType: userArenaDetails.userType,
    })
    .from(user)
    .leftJoin(userArenaDetails, eq(userArenaDetails.userIdRef, user.id))
    .where(eq(user.id, id))
    .limit(1)

  if (!row) return false

  return isClientUser(row.email, { userType: row.userType })
}

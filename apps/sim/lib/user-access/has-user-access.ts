import { db } from '@sim/db'
import { userAccess } from '@sim/db/schema'
import { and, eq } from 'drizzle-orm'
import type { UserAccessCapability } from '@/lib/api/contracts/user'
import { BILLING_NAV_CAPABILITY } from '@/lib/user-access/capabilities'

const KNOWN_CAPABILITIES = new Set<string>([BILLING_NAV_CAPABILITY])

/**
 * Returns whether `userId` has been granted `capability`. No row is deny.
 */
export async function userHasCapability(
  userId: string,
  capability: UserAccessCapability
): Promise<boolean> {
  const rows = await db
    .select({ id: userAccess.id })
    .from(userAccess)
    .where(and(eq(userAccess.userId, userId), eq(userAccess.capability, capability)))
    .limit(1)

  return rows.length > 0
}

/**
 * Lists known capabilities granted to `userId`. Unknown capability strings in
 * the table are ignored so a future value cannot break the response schema.
 */
export async function listUserCapabilities(userId: string): Promise<UserAccessCapability[]> {
  const rows = await db
    .select({ capability: userAccess.capability })
    .from(userAccess)
    .where(eq(userAccess.userId, userId))

  return rows
    .map((row) => row.capability)
    .filter((capability): capability is UserAccessCapability => KNOWN_CAPABILITIES.has(capability))
}

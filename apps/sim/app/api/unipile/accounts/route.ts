import { db } from '@sim/db'
import { outreachUserConnectionsV1 } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { checkSessionOrInternalAuth } from '@/lib/auth/hybrid'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'

const logger = createLogger('UnipileAccountsAPI')

interface UnipileAccountOption {
  id: string
  label: string
}

/**
 * Lists Unipile account options for the block editor from outreach_user_connections_v1.
 * Returns only accounts marked visible via is_shown and connected.
 */
export const GET = withRouteHandler(async (request: NextRequest) => {
  const auth = await checkSessionOrInternalAuth(request, { requireWorkflowId: false })
  if (!auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const rows = await db
      .select({
        accountId: outreachUserConnectionsV1.accountId,
        name: outreachUserConnectionsV1.name,
        userEmail: outreachUserConnectionsV1.userEmail,
        platformType: outreachUserConnectionsV1.platformType,
      })
      .from(outreachUserConnectionsV1)
      .where(eq(outreachUserConnectionsV1.isShown, true))

    const options: UnipileAccountOption[] = rows
      .map((row) => {
        const id = typeof row.accountId === 'string' ? row.accountId.trim() : ''
        if (!id) return null
        const displayName =
          typeof row.name === 'string' && row.name.trim() !== '' ? row.name.trim() : 'Account'
        const email =
          typeof row.userEmail === 'string' && row.userEmail.trim() !== ''
            ? row.userEmail.trim()
            : null
        const type =
          typeof row.platformType === 'string' && row.platformType.trim() !== ''
            ? row.platformType.trim()
            : 'unipile'
        const label = email ? `${displayName} (${email}) - ${type}` : `${displayName} - ${type}`
        return { id, label }
      })
      .filter((row): row is UnipileAccountOption => row !== null)

    return NextResponse.json({ success: true, items: options })
  } catch (error) {
    logger.error('Unipile list accounts error', { error })
    return NextResponse.json(
      { success: false, error: 'Failed to list accounts', items: [] as UnipileAccountOption[] },
      { status: 500 }
    )
  }
})

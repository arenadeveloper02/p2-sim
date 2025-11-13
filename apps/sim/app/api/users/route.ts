import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createLogger } from '@/lib/logs/console/logger'
import { createErrorResponse } from '@/app/api/workflows/utils'
import { db } from '@/db'
import { apiKey as apiKeyTable, user, userArenaDetails } from '@/db/schema'

const logger = createLogger('UsersAPI')

export async function GET(request: NextRequest) {
  try {
    // Try session auth first (for web UI)
    const session = await getSession()
    let authenticatedUserId: string | null = session?.user?.id || null

    // If no session, check for API key auth
    if (!authenticatedUserId) {
      const apiKeyHeader = request.headers.get('x-api-key')
      if (apiKeyHeader) {
        // Verify API key
        const [apiKeyRecord] = await db
          .select({ userId: apiKeyTable.userId })
          .from(apiKeyTable)
          .where(eq(apiKeyTable.key, apiKeyHeader))
          .limit(1)

        if (apiKeyRecord) {
          authenticatedUserId = apiKeyRecord.userId
        }
      }
    }

    if (!authenticatedUserId) {
      return createErrorResponse('Authentication required', 401)
    }

    // Get all users (including client_stakeholder) with user_arena_details
    // This endpoint returns ALL users, unlike /api/users/approval which filters out client_stakeholder
    const rows = await db
      .select({ user, userType: userArenaDetails.userType })
      .from(user)
      .leftJoin(userArenaDetails, eq(userArenaDetails.userIdRef, user.id))

    const users = rows.map((r) => ({ ...r.user, userType: r.userType ?? null }))

    return NextResponse.json({
      success: true,
      users: users,
    })
  } catch (error: any) {
    logger.error('Error fetching users:', error)
    return createErrorResponse(error.message || 'Failed to fetch users', 500)
  }
}

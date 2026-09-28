import { db } from '@sim/db'
import { settings, user } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { generateShortId } from '@sim/utils/id'
import { normalizeEmail } from '@sim/utils/string'
import { eq, or } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { updateArenaTimezoneContract } from '@/lib/api/contracts'
import { parseRequest, validationErrorResponse } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { verifyCronAuth } from '@/lib/auth/internal'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { mapArenaTimezone } from '@/lib/users/arena-timezone'

const logger = createLogger('ArenaTimezoneAPI')

/**
 * Resolves a Sim user id from an email address.
 */
async function resolveUserIdByEmail(emailId: string): Promise<string | null> {
  const normalizedEmail = normalizeEmail(emailId)
  const [userRecord] = await db
    .select({ id: user.id })
    .from(user)
    .where(or(eq(user.email, normalizedEmail), eq(user.normalizedEmail, normalizedEmail)))
    .limit(1)

  return userRecord?.id ?? null
}

/**
 * PATCH /api/users/me/settings/arena/timezone
 * Maps an Arena timezone (or single-zone country) onto the stored IANA timezone.
 * Auth: logged-in Sim session, or `Authorization: Bearer <CRON_SECRET>`.
 * Cron requests must include `emailId`.
 */
export const PATCH = withRouteHandler(async (request: NextRequest) => {
  const requestId = generateRequestId()

  try {
    const session = await getSession()
    const sessionUserId = session?.user?.id ?? null

    if (!sessionUserId) {
      const authError = verifyCronAuth(request, 'Arena timezone update')
      if (authError) {
        return authError
      }
    }

    const parsed = await parseRequest(
      updateArenaTimezoneContract,
      request,
      {},
      {
        validationErrorResponse: (error) => {
          logger.warn(`[${requestId}] Invalid arena timezone data`, { errors: error.issues })
          return validationErrorResponse(error, 'Invalid timezone data')
        },
      }
    )
    if (!parsed.success) return parsed.response

    const {
      timeZone,
      time_zone: timeZoneElement,
      timezone: timezoneField,
      country,
      emailId,
    } = parsed.data.body
    const mapped = mapArenaTimezone({
      timeZone: timeZone ?? timeZoneElement ?? timezoneField,
      country,
    })

    if (!mapped) {
      logger.warn(`[${requestId}] Arena timezone could not be mapped`)
      return NextResponse.json(
        { error: 'Timezone could not be mapped to a supported IANA timezone' },
        { status: 400 }
      )
    }

    const { timezone, label } = mapped

    let userId = sessionUserId
    if (!userId) {
      if (!emailId) {
        return NextResponse.json(
          { error: 'emailId is required when authenticating with CRON_SECRET' },
          { status: 400 }
        )
      }

      userId = await resolveUserIdByEmail(emailId)
      if (!userId) {
        logger.warn(`[${requestId}] User not found for arena timezone update`)
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }
    }

    await db
      .insert(settings)
      .values({
        id: generateShortId(),
        userId,
        timezone,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [settings.userId],
        set: {
          timezone,
          updatedAt: new Date(),
        },
      })

    logger.info(`[${requestId}] Arena timezone updated`, {
      auth: sessionUserId ? 'session' : 'cron',
      timezone,
    })
    return NextResponse.json({ success: true, timezone, label }, { status: 200 })
  } catch (error: unknown) {
    logger.error(`[${requestId}] Arena timezone update error`, error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to update timezone') },
      { status: 500 }
    )
  }
})

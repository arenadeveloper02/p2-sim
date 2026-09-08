import { db } from '@sim/db'
import { settings, user } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { generateShortId } from '@sim/utils/id'
import { normalizeEmail } from '@sim/utils/string'
import { eq, or } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import {
  getArenaUserSettingsContract,
  updateArenaUserSettingsContract,
} from '@/lib/api/contracts'
import { parseRequest, validationErrorResponse } from '@/lib/api/server'
import { verifyCronAuth } from '@/lib/auth/internal'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { arenaThemePubSub } from '@/lib/users/arena-theme-pubsub'
import { getUserSettings } from '@/lib/users/queries'

const logger = createLogger('ArenaUserSettingsAPI')

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
 * GET /api/users/me/settings/arena?emailId=
 * Returns settings for the user identified by email.
 * Auth: `Authorization: Bearer <CRON_SECRET>`
 */
export const GET = withRouteHandler(async (request: NextRequest) => {
  const requestId = generateRequestId()

  const authError = verifyCronAuth(request, 'Arena user settings fetch')
  if (authError) {
    return authError
  }

  try {
    const parsed = await parseRequest(
      getArenaUserSettingsContract,
      request,
      {},
      {
        validationErrorResponse: (error) => {
          logger.warn(`[${requestId}] Invalid arena settings query`, { errors: error.issues })
          return validationErrorResponse(error, 'Invalid settings query')
        },
      }
    )
    if (!parsed.success) return parsed.response

    const { emailId } = parsed.data.query
    const userId = await resolveUserIdByEmail(emailId)

    if (!userId) {
      logger.warn(`[${requestId}] User not found for arena settings fetch`, { emailId })
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const data = await getUserSettings(userId)
    return NextResponse.json({ data }, { status: 200 })
  } catch (error: unknown) {
    logger.error(`[${requestId}] Arena settings fetch error`, error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to fetch settings') },
      { status: 500 }
    )
  }
})

/**
 * PATCH /api/users/me/settings/arena
 * Updates theme for the user identified by emailId in the body.
 * Auth: `Authorization: Bearer <CRON_SECRET>`
 */
export const PATCH = withRouteHandler(async (request: NextRequest) => {
  const requestId = generateRequestId()

  const authError = verifyCronAuth(request, 'Arena user settings update')
  if (authError) {
    return authError
  }

  try {
    const parsed = await parseRequest(
      updateArenaUserSettingsContract,
      request,
      {},
      {
        validationErrorResponse: (error) => {
          logger.warn(`[${requestId}] Invalid arena settings data`, { errors: error.issues })
          return validationErrorResponse(error, 'Invalid settings data')
        },
      }
    )
    if (!parsed.success) return parsed.response

    const { emailId, theme } = parsed.data.body
    const userId = await resolveUserIdByEmail(emailId)

    if (!userId) {
      logger.warn(`[${requestId}] User not found for arena settings update`, { emailId })
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const normalizedEmail = normalizeEmail(emailId)

    await db
      .insert(settings)
      .values({
        id: generateShortId(),
        userId,
        theme,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [settings.userId],
        set: {
          theme,
          updatedAt: new Date(),
        },
      })

    arenaThemePubSub?.publishThemeChanged({
      userId,
      emailId: normalizedEmail,
      theme,
    })

    logger.info(`[${requestId}] Arena theme updated`, { emailId: normalizedEmail, theme })
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (error: unknown) {
    logger.error(`[${requestId}] Arena settings update error`, error)
    return NextResponse.json(
      { error: getErrorMessage(error, 'Failed to update settings') },
      { status: 500 }
    )
  }
})

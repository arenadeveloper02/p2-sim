import { db } from '@sim/db'
import { deployedApp } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { and, eq, isNull } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { validateGenerativeAppIdentifierContract } from '@/lib/api/contracts/arena-generative-apps'
import { parseRequest } from '@/lib/api/server'
import { isReservedGenerativeAppIdentifier } from '@/lib/arena-generative-ui/types'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'

const logger = createLogger('GenerativeAppValidateAPI')

export const GET = withRouteHandler(async (request: NextRequest) => {
  const session = await getSession()
  if (!session?.user?.id) {
    return createErrorResponse('Unauthorized', 401)
  }

  const parsed = await parseRequest(validateGenerativeAppIdentifierContract, request, {})
  if (!parsed.success) return parsed.response

  const identifier = parsed.data.query.identifier
  if (isReservedGenerativeAppIdentifier(identifier)) {
    return createSuccessResponse({
      available: false,
      error: 'This identifier is reserved',
    })
  }

  try {
    const existing = await db
      .select({ id: deployedApp.id })
      .from(deployedApp)
      .where(and(eq(deployedApp.identifier, identifier), isNull(deployedApp.archivedAt)))
      .limit(1)

    const available = existing.length === 0
    logger.debug(`Identifier "${identifier}" availability: ${available ? 'available' : 'taken'}`)
    return createSuccessResponse({
      available,
      error: available ? null : 'This identifier is already in use',
    })
  } catch (error) {
    logger.error('Error validating generative app identifier', { error })
    return createErrorResponse('Failed to validate identifier', 500)
  }
})

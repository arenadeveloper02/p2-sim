import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { getUserAccessContract } from '@/lib/api/contracts/user'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { listUserCapabilities } from '@/lib/user-access/has-user-access'

const logger = createLogger('UserAccessAPI')

export const GET = withRouteHandler(async (request: NextRequest) => {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = await parseRequest(getUserAccessContract, request, {})
  if (!parsed.success) return parsed.response

  const capabilities = await listUserCapabilities(session.user.id)
  logger.info('Listed user capabilities', { count: capabilities.length })
  return NextResponse.json({ capabilities })
})

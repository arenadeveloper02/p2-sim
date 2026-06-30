import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { parseRequest } from '@/lib/api/server'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import {
  getLocalCopilotConfig,
  getLocalCopilotAllowedEmails,
  isSelfHostedDeployment,
  isUserAllowedForLocalCopilot,
} from '@/local-copilot/lib/config'
import { resolveUserEmailForCopilot } from '@/local-copilot/lib/resolve-user-email'
import { getLocalCopilotConfigContract } from '@/local-copilot/contracts/local-copilot'

const logger = createLogger('LocalCopilotConfigAPI')

export const GET = withRouteHandler(async (request: NextRequest) => {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = await parseRequest(getLocalCopilotConfigContract, request, {})
  if (!parsed.success) return parsed.response

  const config = getLocalCopilotConfig()
  const userEmail = await resolveUserEmailForCopilot(session.user.id, session.user.email)
  const canSwitchBackend =
    config.enabled &&
    (getLocalCopilotAllowedEmails().length === 0 || isUserAllowedForLocalCopilot(userEmail))
  const enabled = canSwitchBackend
  logger.info('Returning Arena Copilot config', { enabled, canSwitchBackend, userEmail })

  return NextResponse.json({
    enabled,
    canSwitchBackend,
    provider: config.provider,
    model: config.model,
    selfHosted: isSelfHostedDeployment(),
  })
})

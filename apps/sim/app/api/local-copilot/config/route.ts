import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { getLocalCopilotConfigContract } from '@/local-copilot/contracts/local-copilot'
import { isLocalCopilotEnabledForUser } from '@/local-copilot/lib/access'
import { getLocalCopilotConfig, isSelfHostedDeployment } from '@/local-copilot/lib/config'

const logger = createLogger('LocalCopilotConfigAPI')

export const GET = withRouteHandler(async (request: NextRequest) => {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = await parseRequest(getLocalCopilotConfigContract, request, {})
  if (!parsed.success) return parsed.response

  const config = getLocalCopilotConfig()
  const canSwitchBackend = await isLocalCopilotEnabledForUser(session.user.id)
  const enabled = canSwitchBackend
  logger.info('Returning Arena Copilot config', {
    enabled,
    canSwitchBackend,
    userId: session.user.id,
  })

  return NextResponse.json({
    enabled,
    canSwitchBackend,
    provider: config.provider,
    model: config.model,
    selfHosted: isSelfHostedDeployment(),
  })
})

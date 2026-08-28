import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import {
  getLocalCopilotConfigContract,
  updateLocalCopilotConfigContract,
} from '@/local-copilot/contracts/local-copilot'
import type { LocalCopilotUserAccess } from '@/local-copilot/lib/access'
import {
  getLocalCopilotUserAccess,
  updateLocalCopilotDefaultModel,
} from '@/local-copilot/lib/access'
import { getLocalCopilotConfig, isSelfHostedDeployment } from '@/local-copilot/lib/config'

const logger = createLogger('LocalCopilotConfigAPI')

function toConfigResponse(access: LocalCopilotUserAccess) {
  const config = getLocalCopilotConfig()
  const enabled = access.hasAccess || access.localOnly
  const canSwitchBackend = access.hasAccess && !access.localOnly
  return {
    enabled,
    canSwitchBackend,
    localOnly: access.localOnly,
    defaultCatalogId: access.defaultModel,
    provider: config.provider,
    model: config.model,
    specialistModel: config.specialistModel,
    selfHosted: isSelfHostedDeployment(),
  }
}

export const GET = withRouteHandler(async (request: NextRequest) => {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = await parseRequest(getLocalCopilotConfigContract, request, {})
  if (!parsed.success) return parsed.response

  const access = await getLocalCopilotUserAccess(session.user.id)
  const response = toConfigResponse(access)
  logger.info('Returning Arena Copilot config', {
    enabled: response.enabled,
    canSwitchBackend: response.canSwitchBackend,
    localOnly: response.localOnly,
    defaultCatalogId: response.defaultCatalogId,
    userId: session.user.id,
  })

  return NextResponse.json(response)
})

export const PATCH = withRouteHandler(async (request: NextRequest) => {
  const session = await getSession()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = await parseRequest(updateLocalCopilotConfigContract, request, {})
  if (!parsed.success) return parsed.response

  const updated = await updateLocalCopilotDefaultModel(
    session.user.id,
    parsed.data.body.defaultCatalogId
  )
  if (!updated) {
    return NextResponse.json(
      { error: 'Arena Copilot is not enabled for your account.' },
      { status: 403 }
    )
  }

  const response = toConfigResponse(updated)
  logger.info('Updated Arena Copilot default model', {
    defaultCatalogId: response.defaultCatalogId,
    userId: session.user.id,
  })
  return NextResponse.json(response)
})

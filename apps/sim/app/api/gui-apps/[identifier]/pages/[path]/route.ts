import type { NextRequest } from 'next/server'
import { getDeployedAppPageContract } from '@/lib/api/contracts/arena-generative-apps'
import { parseRequest } from '@/lib/api/server'
import {
  authorizeDeployedAppRequest,
  findDeployedAppByIdentifier,
} from '@/lib/arena-generative-ui/deployment'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'

export const GET = withRouteHandler(
  async (
    request: NextRequest,
    context: { params: Promise<{ identifier: string; path: string }> }
  ) => {
    const parsed = await parseRequest(getDeployedAppPageContract, request, context)
    if (!parsed.success) return parsed.response

    const deployment = await findDeployedAppByIdentifier(parsed.data.params.identifier)
    if (!deployment) {
      return createErrorResponse('App not found', 404)
    }

    const authorized = await authorizeDeployedAppRequest({ request, deployment })
    if (!authorized.ok) return authorized.response

    const page = deployment.manifest.pages[parsed.data.params.path]
    if (!page) {
      return createErrorResponse('Page not found', 404)
    }

    return createSuccessResponse({
      path: page.path,
      title: page.title,
      spec: page.spec,
    })
  }
)

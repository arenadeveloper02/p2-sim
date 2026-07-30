import { createLogger } from '@sim/logger'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { parseRequest } from '@/lib/api/server'
import { getSession } from '@/lib/auth'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { getLocalCopilotPatchContract } from '@/local-copilot/contracts/local-copilot'
import { requireLocalCopilotAccess } from '@/local-copilot/lib/access'
import { getPatch } from '@/local-copilot/lib/persistence/store'

const logger = createLogger('LocalCopilotPatchAPI')

export const GET = withRouteHandler(
  async (request: NextRequest, { params }: { params: Promise<{ patchId: string }> }) => {
    const session = await getSession()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const accessDenied = await requireLocalCopilotAccess(session.user.id)
    if (accessDenied) return accessDenied

    const routeParams = await params
    const parsed = await parseRequest(getLocalCopilotPatchContract, request, {
      params: routeParams,
    })
    if (!parsed.success) return parsed.response

    const patchRow = await getPatch(parsed.data.params.patchId, session.user.id)
    if (!patchRow) {
      return NextResponse.json({ error: 'Patch not found' }, { status: 404 })
    }

    logger.info('Fetched patch', { patchId: patchRow.id })

    return NextResponse.json({
      id: patchRow.id,
      summary: patchRow.summary,
      status: patchRow.status,
      patch: patchRow.patch,
    })
  }
)

import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { listUnipileAccountsContract } from '@/lib/api/contracts/unipile'
import { parseRequest } from '@/lib/api/server'
import { checkSessionOrInternalAuth } from '@/lib/auth/hybrid'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { listUnipileAccountOptions } from '@/lib/unipile/list-account-options'

const logger = createLogger('UnipileAccountsAPI')

/**
 * Lists LinkedIn (Unipile) account options for the block editor.
 * Admin/shared workspaces include public outreach accounts plus the caller's personal connections.
 */
export const GET = withRouteHandler(async (request: NextRequest) => {
  const auth = await checkSessionOrInternalAuth(request, { requireWorkflowId: false })
  if (!auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const parsed = await parseRequest(listUnipileAccountsContract, request, {})
  if (!parsed.success) return parsed.response

  const { workspaceId } = parsed.data.query
  const userId = auth.userId
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Unauthorized', items: [] }, { status: 401 })
  }

  try {
    const items = await listUnipileAccountOptions({ workspaceId, userId })
    return NextResponse.json({ success: true, items })
  } catch (error) {
    logger.error('Unipile list accounts error', { error, workspaceId, userId })
    return NextResponse.json(
      { success: false, error: 'Failed to list accounts', items: [] },
      { status: 500 }
    )
  }
})

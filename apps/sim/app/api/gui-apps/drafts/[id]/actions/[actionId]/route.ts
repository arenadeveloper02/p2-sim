import { db } from '@sim/db'
import { generativeAppDraft } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { getErrorMessage } from '@sim/utils/errors'
import { eq } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { runGenerativeAppDraftActionContract } from '@/lib/api/contracts/arena-generative-apps'
import { parseRequest } from '@/lib/api/server'
import { buildHttpAllowlist } from '@/lib/arena-generative-ui/http-allowlist'
import { parseApiBindings } from '@/lib/arena-generative-ui/parse-inputs'
import {
  createGenerativeAppActionSseResponse,
  isStreamingAction,
  runGenerativeAppAction,
} from '@/lib/arena-generative-ui/run-action'
import type { ArenaGenerativeAppManifest } from '@/lib/arena-generative-ui/types'
import { getSession } from '@/lib/auth'
import { isDev } from '@/lib/core/config/env-flags'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { checkWorkflowAccessForChatCreation } from '@/app/api/chat/utils'
import { createErrorResponse, createSuccessResponse } from '@/app/api/workflows/utils'

const logger = createLogger('GenerativeAppDraftActionAPI')

export const POST = withRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ id: string; actionId: string }> }) => {
    const session = await getSession()
    if (!session?.user?.id) {
      return createErrorResponse('Unauthorized', 401)
    }

    const parsed = await parseRequest(runGenerativeAppDraftActionContract, request, context)
    if (!parsed.success) return parsed.response

    try {
      const [draft] = await db
        .select()
        .from(generativeAppDraft)
        .where(eq(generativeAppDraft.id, parsed.data.params.id))
        .limit(1)

      if (!draft) {
        return createErrorResponse('Draft not found', 404)
      }

      const { hasAccess } = await checkWorkflowAccessForChatCreation(
        draft.workflowId,
        session.user.id
      )
      if (!hasAccess) {
        return createErrorResponse('Draft not found or access denied', 404)
      }

      const apiBindings = parseApiBindings(draft.apiBindings)
      const allowlist = buildHttpAllowlist(apiBindings, { allowHttp: isDev })
      if (!allowlist.ok) {
        return createErrorResponse(allowlist.error, 400)
      }

      const manifest = draft.manifest as ArenaGenerativeAppManifest
      const actionId = parsed.data.params.actionId
      const values = (parsed.data.body.values ?? {}) as Record<string, unknown>
      const requestId = generateRequestId()
      const runnerOptions = {
        manifest,
        apiBindings,
        httpAllowlist: allowlist.hosts,
        userId: draft.userId,
        workspaceId: draft.workspaceId,
        actionId,
        values,
        requestId,
        actorUserId: session.user.id,
      }

      if (isStreamingAction(manifest, apiBindings, actionId)) {
        return createGenerativeAppActionSseResponse(runnerOptions)
      }

      const result = await runGenerativeAppAction(runnerOptions)
      return createSuccessResponse(result)
    } catch (error) {
      logger.error('Generative app draft action failed', { error: getErrorMessage(error) })
      return createErrorResponse(getErrorMessage(error, 'Action failed'), 500)
    }
  }
)

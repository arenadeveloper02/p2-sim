import { createLogger } from '@sim/logger'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSessionOrInternalAuth } from '@/lib/auth/hybrid'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { importGitHubSkillPack } from '@/lib/workflows/skills/importers/github'

const logger = createLogger('SkillsImportPreviewAPI')

const PreviewSchema = z.object({
  url: z.string().url('A valid URL is required'),
})

export const POST = withRouteHandler(async (req: NextRequest) => {
  const requestId = generateRequestId()

  try {
    const authResult = await checkSessionOrInternalAuth(req, { requireWorkflowId: false })
    if (!authResult.success || !authResult.userId) {
      logger.warn(`[${requestId}] Unauthorized skill import preview attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { url } = PreviewSchema.parse(body)
    const preview = await importGitHubSkillPack(url)

    return NextResponse.json({ preview })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid request', details: error.errors }, { status: 400 })
    }

    if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      logger.warn(`[${requestId}] GitHub import preview timed out`)
      return NextResponse.json({ error: 'Request timed out' }, { status: 504 })
    }

    const message = error instanceof Error ? error.message : 'Failed to preview skill import'
    logger.error(`[${requestId}] Error previewing skill import`, error)
    return NextResponse.json({ error: message }, { status: 400 })
  }
})

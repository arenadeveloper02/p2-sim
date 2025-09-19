import { db } from '@sim/db'
import { workflowTemplateMapper } from '@sim/db/schema'
import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createLogger } from '@/lib/logs/console/logger'

const logger = createLogger('TemplateMapperByIdAPI')

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8)
  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthorized template access attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Extract workspaceId from query params
    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')

    if (!workspaceId) {
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    logger.debug(`[${requestId}] Fetching templates for workspaceId=${workspaceId}`)

    // Fetch the templates for given workspaceId
    const result = await db
      .select()
      .from(workflowTemplateMapper)
      .where(eq(workflowTemplateMapper.workspaceId, workspaceId))

    if (result.length === 0) {
      return NextResponse.json({ error: 'No templates found' }, { status: 404 })
    }

    return NextResponse.json(result)
  } catch (error: any) {
    logger.error(`[${requestId}] Error fetching template`, error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

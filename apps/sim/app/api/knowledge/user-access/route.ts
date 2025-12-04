import { type NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { getUserKnowledgeBaseAccess } from '@/lib/knowledge/service'
import { createLogger } from '@/lib/logs/console/logger'
import { generateRequestId } from '@/lib/utils'

const logger = createLogger('UserKnowledgeAccessAPI')

/**
 * GET /api/knowledge/user-access
 * Get knowledge bases that user has access to via user_knowledge_base table only
 * Returns minimal data with defaults for missing fields
 */
export async function GET(req: NextRequest) {
  const requestId = generateRequestId()

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthorized knowledge base access attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const workspaceId = searchParams.get('workspaceId')

    const knowledgeBases = await getUserKnowledgeBaseAccess(session.user.id, workspaceId, requestId)

    return NextResponse.json({
      success: true,
      data: knowledgeBases,
    })
  } catch (error) {
    logger.error(`[${requestId}] Error fetching user knowledge base access`, error)
    return NextResponse.json({ error: 'Failed to fetch knowledge bases' }, { status: 500 })
  }
}


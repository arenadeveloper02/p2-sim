import { and, desc, eq, ilike, or } from 'drizzle-orm'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { createLogger } from '@/lib/logs/console/logger'
import { db } from '@/db'
import { user, workflowStatus } from '@/db/schema'

const logger = createLogger('ApprovalsAPI')

export const dynamic = 'force-dynamic'
export const revalidate = 0

// GET /api/approvals - Fetch pending approval workflows
export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8)

  try {
    const session = await getSession()
    if (!session?.user) {
      logger.warn(`[${requestId}] Unauthorized access attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const workspaceId = searchParams.get('workspaceId')
    const limit = Number.parseInt(searchParams.get('limit') || '100')
    const offset = Number.parseInt(searchParams.get('offset') || '0')
    const search = searchParams.get('search') || ''

    if (!workspaceId) {
      logger.warn(`[${requestId}] Missing workspaceId parameter`)
      return NextResponse.json({ error: 'workspaceId is required' }, { status: 400 })
    }

    // Fetch all pending approval workflows with owner info
    const pendingApprovals = await db
      .select({
        id: workflowStatus.id,
        name: workflowStatus.name,
        workflowId: workflowStatus.workflowId,
        mappedWorkflowId: workflowStatus.mappedWorkflowId,
        status: workflowStatus.status,
        category: workflowStatus.category,
        description: workflowStatus.description,
        createdAt: workflowStatus.createdAt,
        updatedAt: workflowStatus.updatedAt,
        userId: workflowStatus.userId,
        ownerName: user.name,
        ownerEmail: user.email,
      })
      .from(workflowStatus)
      .innerJoin(user, eq(workflowStatus.ownerId, user.id))
      .where(
        and(
          eq(workflowStatus.status, 'PENDING'),
          search
            ? or(
                ilike(workflowStatus.name, `%${search}%`),
                ilike(user.name, `%${search}%`),
                ilike(user.email, `%${search}%`),
                ilike(workflowStatus.category, `%${search}%`),
                ilike(workflowStatus.description, `%${search}%`)
              )
            : undefined
        )
      )
      .orderBy(desc(workflowStatus.createdAt))
      .limit(limit)
      .offset(offset)

    // Fetch all users once for efficient mapping
    const allUsers = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
      })
      .from(user)

    // Create a user lookup map for efficient access
    const userMap = new Map(allUsers.map((u) => [u.id, u]))

    // Map approvals with approver details
    const approvalsWithApprovers = pendingApprovals.map((approval) => {
      const approver = approval.userId ? userMap.get(approval.userId) : null

      return {
        ...approval,
        approverName: approver?.name || null,
        approverEmail: approver?.email || 'Unassigned',
      }
    })

    // Get total count for pagination
    const totalCountResult = await db
      .select({ count: workflowStatus.id })
      .from(workflowStatus)
      .innerJoin(user, eq(workflowStatus.ownerId, user.id))
      .where(
        and(
          eq(workflowStatus.status, 'PENDING'),
          search
            ? or(
                ilike(workflowStatus.name, `%${search}%`),
                ilike(user.name, `%${search}%`),
                ilike(user.email, `%${search}%`),
                ilike(workflowStatus.category, `%${search}%`),
                ilike(workflowStatus.description, `%${search}%`)
              )
            : undefined
        )
      )

    const totalCount = totalCountResult.length
    const hasMore = offset + approvalsWithApprovers.length < totalCount

    logger.info(
      `[${requestId}] Fetched ${approvalsWithApprovers.length} of ${totalCount} pending approvals (offset: ${offset})`
    )

    return NextResponse.json({
      approvals: approvalsWithApprovers,
      count: approvalsWithApprovers.length,
      totalCount,
      hasMore,
      offset,
      limit,
    })
  } catch (error) {
    logger.error(`[${requestId}] Error fetching approvals:`, error)
    return NextResponse.json({ error: 'Failed to fetch approvals' }, { status: 500 })
  }
}

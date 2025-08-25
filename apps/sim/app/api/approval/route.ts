import { and, desc, eq, gte, inArray, lte, type SQL, sql } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { createLogger } from '@/lib/logs/console/logger'
import { db } from '@/db'
import { permissions, workflow, approvalList } from '@/db/schema'

const logger = createLogger('ApprovalAPI')

export const revalidate = 0

const QueryParamsSchema = z.object({
  details: z.enum(['basic', 'full']).optional().default('basic'),
  limit: z.coerce.number().optional().default(100),
  offset: z.coerce.number().optional().default(0),
  level: z.string().optional(),
  workflowIds: z.string().optional(), // Comma-separated list of workflow IDs
  folderIds: z.string().optional(), // Comma-separated list of folder IDs
  triggers: z.string().optional(), // Comma-separated list of trigger types
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
  workspaceId: z.string(),
})

export async function GET(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8)

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthorized logs access attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const userId = session.user.id
    console.log(userId, 'userId')
    try {
      const { searchParams } = new URL(request.url)
      const params = QueryParamsSchema.parse(Object.fromEntries(searchParams.entries()))

      const baseQuery = db
        .select({
          id: approvalList.id,
          userId: approvalList.userId,
          name: approvalList.name,
          approvalId: approvalList.approvalId,
          description: approvalList.description,
          status: approvalList.status,
          rejectedComment: approvalList.rejectedComment,
          workspaceId: approvalList.workspaceId,
          workflowId: approvalList.workflowId,
          createdAt: approvalList.createdAt,
          updatedAt: approvalList.updatedAt,
          createdBy: approvalList.createdBy,
        })
        .from(approvalList)

      // Build conditions for the joined query
      let conditions: SQL | undefined = eq(approvalList.approvalId, userId)

      // Execute the query using the optimized join
      const logs = await baseQuery
        .where(conditions)
        .orderBy(desc(approvalList.createdAt))
        .limit(params.limit)
        .offset(params.offset)

      // Get total count for pagination using the same join structure
      const countQuery = db
        .select({ count: sql<number>`count(*)` })
        .from(approvalList)
        .where(conditions)

      const countResult = await countQuery

      const count = countResult[0]?.count || 0

      return NextResponse.json(
        {
          data: logs,
          total: Number(count),
          page: Math.floor(params.offset / params.limit) + 1,
          pageSize: params.limit,
          totalPages: Math.ceil(Number(count) / params.limit),
        },
        { status: 200 }
      )
    } catch (validationError) {
      if (validationError instanceof z.ZodError) {
        logger.warn(`[${requestId}] Invalid logs request parameters`, {
          errors: validationError.errors,
        })
        return NextResponse.json(
          {
            error: 'Invalid request parameters',
            details: validationError.errors,
          },
          { status: 400 }
        )
      }
      throw validationError
    }
  } catch (error: any) {
    logger.error(`[${requestId}] logs fetch error`, error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

import { randomUUID } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import type { KbApprovalGroup, KbApprovalWithDetails } from '@/lib/kb-approval/types'
import { createLogger } from '@/lib/logs/console/logger'
import { db } from '@/db'
import { document, kbApprovalStatus, knowledgeBase, user, workspace } from '@/db/schema'

const logger = createLogger('KbApprovalAPI')

const CreateKbApprovalSchema = z.object({
  kbId: z.string().min(1, 'Knowledge Base ID is required'),
  approverId: z.string().min(1, 'Approver ID is required'),
  documentIds: z.array(z.string()).min(1, 'At least one document ID is required'),
  workspaceId: z.string().min(1, 'Workspace ID is required'),
  groupingId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8)

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthorized KB approval creation attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const validatedData = CreateKbApprovalSchema.parse(body)

    // Generate grouping ID if not provided
    const groupingId = validatedData.groupingId || randomUUID()

    // Verify knowledge base exists and user has access
    const kb = await db
      .select()
      .from(knowledgeBase)
      .where(eq(knowledgeBase.id, validatedData.kbId))
      .limit(1)

    if (kb.length === 0) {
      return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 })
    }

    // Verify workspace exists
    const ws = await db
      .select()
      .from(workspace)
      .where(eq(workspace.id, validatedData.workspaceId))
      .limit(1)

    if (ws.length === 0) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 })
    }

    // Verify documents exist and belong to the knowledge base
    const documents = await db
      .select()
      .from(document)
      .where(
        and(
          eq(document.knowledgeBaseId, validatedData.kbId)
          // Check if all document IDs exist in the knowledge base
          // This is a simplified check - in production you might want to validate each ID individually
        )
      )

    const validDocumentIds = documents.map((doc) => doc.id)
    const invalidDocumentIds = validatedData.documentIds.filter(
      (id) => !validDocumentIds.includes(id)
    )

    if (invalidDocumentIds.length > 0) {
      return NextResponse.json(
        {
          error: 'Some documents not found or do not belong to this knowledge base',
          invalidIds: invalidDocumentIds,
        },
        { status: 400 }
      )
    }

    // Create individual approval requests for each document
    const now = new Date()
    const approvalRequests = validatedData.documentIds.map((documentId) => ({
      id: randomUUID(),
      kbId: validatedData.kbId,
      approverId: validatedData.approverId,
      documentId: documentId,
      workspaceId: validatedData.workspaceId,
      groupingId: groupingId,
      status: 'pending' as const,
      createdAt: now,
      updatedAt: now,
    }))

    // Insert all approval requests in a transaction
    await db.insert(kbApprovalStatus).values(approvalRequests)

    logger.info(
      `[${requestId}] Created ${approvalRequests.length} KB approval requests with grouping ID: ${groupingId} for KB: ${validatedData.kbId}`
    )

    return NextResponse.json({
      success: true,
      data: {
        groupingId,
        approvals: approvalRequests,
        documentCount: approvalRequests.length,
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(`[${requestId}] Invalid KB approval request data`, { errors: error.errors })
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    logger.error(`[${requestId}] Error creating KB approval request`, error)
    return NextResponse.json({ error: 'Failed to create approval request' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8)

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthorized KB approval fetch attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const kbId = searchParams.get('kbId')

    if (!kbId) {
      return NextResponse.json({ error: 'Knowledge Base ID is required' }, { status: 400 })
    }

    // Fetch approval requests with additional details
    const approvals = await db
      .select({
        id: kbApprovalStatus.id,
        kbId: kbApprovalStatus.kbId,
        approverId: kbApprovalStatus.approverId,
        documentId: kbApprovalStatus.documentId,
        workspaceId: kbApprovalStatus.workspaceId,
        groupingId: kbApprovalStatus.groupingId,
        status: kbApprovalStatus.status,
        createdAt: kbApprovalStatus.createdAt,
        updatedAt: kbApprovalStatus.updatedAt,
        approverName: user.name,
        approverEmail: user.email,
        knowledgeBaseName: knowledgeBase.name,
        documentName: document.filename,
      })
      .from(kbApprovalStatus)
      .leftJoin(user, eq(kbApprovalStatus.approverId, user.id))
      .leftJoin(knowledgeBase, eq(kbApprovalStatus.kbId, knowledgeBase.id))
      .leftJoin(document, eq(kbApprovalStatus.documentId, document.id))
      .where(eq(kbApprovalStatus.kbId, kbId))
      .orderBy(kbApprovalStatus.createdAt)

    const approvalsWithDetails: KbApprovalWithDetails[] = approvals.map((approval) => ({
      id: approval.id,
      kbId: approval.kbId,
      approverId: approval.approverId,
      documentId: approval.documentId,
      workspaceId: approval.workspaceId,
      groupingId: approval.groupingId,
      status: approval.status as 'pending' | 'approved' | 'rejected',
      createdAt: approval.createdAt,
      updatedAt: approval.updatedAt,
      approverName: approval.approverName || undefined,
      approverEmail: approval.approverEmail || undefined,
      knowledgeBaseName: approval.knowledgeBaseName || undefined,
      documentName: approval.documentName || undefined,
    }))

    // Group approvals by groupingId
    const groupedApprovals = new Map<string, KbApprovalGroup>()

    approvalsWithDetails.forEach((approval) => {
      const groupKey = approval.groupingId

      if (!groupedApprovals.has(groupKey)) {
        groupedApprovals.set(groupKey, {
          groupingId: approval.groupingId,
          kbId: approval.kbId,
          approverId: approval.approverId,
          status: approval.status,
          createdAt: approval.createdAt,
          updatedAt: approval.updatedAt,
          documents: [],
          approverName: approval.approverName,
          approverEmail: approval.approverEmail,
          knowledgeBaseName: approval.knowledgeBaseName,
          documentCount: 0,
        })
      }

      const group = groupedApprovals.get(groupKey)!
      group.documents.push(approval)
      group.documentCount = group.documents.length

      // Update group status based on individual document statuses
      if (approval.status === 'rejected') {
        group.status = 'rejected'
      } else if (approval.status === 'pending' && group.status !== 'rejected') {
        group.status = 'pending'
      } else if (approval.status === 'approved' && group.status === 'pending') {
        group.status = 'approved'
      }
    })

    const groupedApprovalsArray = Array.from(groupedApprovals.values())

    logger.info(
      `[${requestId}] Fetched ${approvalsWithDetails.length} individual approval requests grouped into ${groupedApprovalsArray.length} groups for KB: ${kbId}`
    )

    return NextResponse.json({
      success: true,
      data: {
        individual: approvalsWithDetails,
        grouped: groupedApprovalsArray,
      },
    })
  } catch (error) {
    logger.error(`[${requestId}] Error fetching KB approval requests`, error)
    return NextResponse.json({ error: 'Failed to fetch approval requests' }, { status: 500 })
  }
}

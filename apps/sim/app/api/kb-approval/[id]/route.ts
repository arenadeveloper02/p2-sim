import { eq } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import type { KbApprovalWithDetails } from '@/lib/kb-approval/types'
import { createLogger } from '@/lib/logs/console/logger'
import { db } from '@/db'
import { document, kbApprovalStatus, knowledgeBase, user } from '@/db/schema'

const logger = createLogger('KbApprovalUpdateAPI')

const UpdateKbApprovalSchema = z.object({
  status: z.enum(['approved', 'rejected'], {
    required_error: 'Status is required',
    invalid_type_error: 'Status must be either "approved" or "rejected"',
  }),
})

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const requestId = crypto.randomUUID().slice(0, 8)
  const { id: groupingId } = await params

  try {
    const session = await getSession()
    if (!session?.user?.id) {
      logger.warn(`[${requestId}] Unauthorized KB approval update attempt`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const validatedData = UpdateKbApprovalSchema.parse(body)

    // Check if approval request exists and user has permission to update it
    const existingApproval = await db
      .select({
        id: kbApprovalStatus.id,
        kbId: kbApprovalStatus.kbId,
        approverId: kbApprovalStatus.approverId,
        documentId: kbApprovalStatus.documentId,
        workspaceId: kbApprovalStatus.workspaceId,
        groupingId: kbApprovalStatus.groupingId,
        status: kbApprovalStatus.status
      })
      .from(kbApprovalStatus)
      .where(eq(kbApprovalStatus.groupingId, groupingId))

    if (existingApproval.length === 0) {
      return NextResponse.json({ error: 'Approval request not found' }, { status: 404 })
    }

    const approval = existingApproval[0]

    // Check if user is the approver or the KB owner
    const isApprover = approval.approverId === session.user.id

    if (!isApprover) {
      logger.warn(
        `[${requestId}] User ${session.user.id} attempted to update approval ${groupingId} without permission`
      )
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Check if approval is already processed
    if (approval.status !== 'pending') {
      return NextResponse.json(
        { error: 'Approval request has already been processed' },
        { status: 400 }
      )
    }

    // Update approval status
    const now = new Date()
    await db
      .update(kbApprovalStatus)
      .set({
        status: validatedData.status,
        updatedAt: now,
      })
      .where(eq(kbApprovalStatus.groupingId, groupingId))

    // Fetch updated approval with details
    const updatedApproval = await db
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
      .where(eq(kbApprovalStatus.id, groupingId))
      .limit(1)

    const approvalWithDetails: KbApprovalWithDetails = {
      id: updatedApproval[0].id,
      kbId: updatedApproval[0].kbId,
      approverId: updatedApproval[0].approverId,
      documentId: updatedApproval[0].documentId,
      workspaceId: updatedApproval[0].workspaceId,
      groupingId: updatedApproval[0].groupingId,
      status: updatedApproval[0].status as 'pending' | 'approved' | 'rejected',
      createdAt: updatedApproval[0].createdAt,
      updatedAt: updatedApproval[0].updatedAt,
      approverName: updatedApproval[0].approverName || undefined,
      approverEmail: updatedApproval[0].approverEmail || undefined,
      knowledgeBaseName: updatedApproval[0].knowledgeBaseName || undefined,
      documentName: updatedApproval[0].documentName || undefined,
    }

    logger.info(
      `[${requestId}] Updated KB approval ${groupingId} to status: ${validatedData.status}`
    )

    return NextResponse.json({
      success: true,
      data: approvalWithDetails,
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.warn(`[${requestId}] Invalid KB approval update data`, { errors: error.errors })
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    logger.error(`[${requestId}] Error updating KB approval ${groupingId}`, error)
    return NextResponse.json({ error: 'Failed to update approval request' }, { status: 500 })
  }
}

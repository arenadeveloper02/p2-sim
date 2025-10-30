import crypto from 'crypto'
import { and, desc, eq, or } from 'drizzle-orm'
import { type NextRequest, NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { z } from 'zod'
import { getSession } from '@/lib/auth'
import { createLogger } from '@/lib/logs/console/logger'
import { getUserEntityPermissions } from '@/lib/permissions/utils'
import { loadWorkflowFromNormalizedTables } from '@/lib/workflows/db-helpers'
import { db } from '@/db'
import {
  permissions,
  templates,
  user,
  workflow,
  workflowBlocks,
  workflowEdges,
  workflowStatus,
  workflowSubflows,
  workspace,
} from '@/db/schema'
import type { LoopConfig, ParallelConfig } from '@/stores/workflows/workflow/types'

const logger = createLogger('WorkflowApprovalAPI')

const ApprovalRequestSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  description: z.string().optional(),
  color: z.string().optional(),
  workspaceId: z.string().optional(),
  folderId: z.string().nullable().optional(),
  approvalUserId: z.string().min(1, 'Approval user ID is required'),
  category: z.string().optional().default('creative'),
})

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: sourceWorkflowId } = await params
  const requestId = crypto.randomUUID().slice(0, 8)
  const startTime = Date.now()

  const session = await getSession()
  if (!session?.user?.id) {
    logger.warn(`[${requestId}] Unauthorized workflow duplication attempt for ${sourceWorkflowId}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { name, description, color, workspaceId, folderId, approvalUserId, category } =
      ApprovalRequestSchema.parse(body)
    let newWorkspaceId = crypto.randomUUID()
    const now = new Date()
    const workflowApproval = await db.transaction(async (tx) => {
      /**
       * Get arena developer user details
       */
      const arenaUser = await tx
        .select()
        .from(user)
        .where(eq(user.email, 'arenadeveloper@position2.com'))
        .limit(1)
      const userWorkspace = await tx
        .select()
        .from(workspace)
        .where(and(eq(workspace.name, 'AGENTS APPROVAL'), eq(workspace.ownerId, arenaUser[0].id)))
        .limit(1)
      if (userWorkspace.length === 0) {
        logger.warn(
          `[${requestId}] User ${session.user.id} does not have an approval workspace, creating one`
        )
        await tx.insert(workspace).values({
          id: newWorkspaceId,
          ownerId: arenaUser[0].id,
          name: `AGENTS APPROVAL`,
          createdAt: now,
          updatedAt: now,
        })
        const permissionsId = crypto.randomUUID()
        await tx.insert(permissions).values({
          id: permissionsId,
          userId: arenaUser[0].id,
          entityType: `workspace`,
          entityId: newWorkspaceId,
          permissionType: `admin`,
          createdAt: now,
          updatedAt: now,
        })
      } else {
        newWorkspaceId = userWorkspace[0].id as `${string}-${string}-${string}-${string}-${string}`
      }
      const ownerPermission = await tx
        .select()
        .from(permissions)
        .where(
          and(
            eq(permissions.entityType, 'workspace'),
            eq(permissions.entityId, newWorkspaceId),
            eq(permissions.userId, approvalUserId)
          )
        )
        .limit(1)
      if (ownerPermission.length === 0) {
        const permissionsId = crypto.randomUUID()
        await tx.insert(permissions).values({
          id: permissionsId,
          userId: approvalUserId,
          entityType: `workspace`,
          entityId: newWorkspaceId,
          permissionType: `admin`,
          createdAt: now,
          updatedAt: now,
        })
      }
    })
    logger.info(
      `[${requestId}] Duplicating workflow ${sourceWorkflowId} for user ${session.user.id}`
    )

    // Generate new workflow ID
    const newWorkflowId = crypto.randomUUID()

    // Approval workflow and all related data in a transaction
    const result = await db.transaction(async (tx) => {
      // First verify the source workflow exists
      const sourceWorkflow = await tx
        .select()
        .from(workflow)
        .where(eq(workflow.id, sourceWorkflowId))
        .limit(1)

      if (sourceWorkflow.length === 0) {
        throw new Error('Source workflow not found')
      }

      const source = sourceWorkflow[0]

      // Check if user has permission to access the source workflow
      let canAccessSource = false

      // Case 1: User owns the workflow
      if (source.userId === session.user.id) {
        canAccessSource = true
      }

      // Case 2: User has admin or write permission in the source workspace
      if (!canAccessSource && source.workspaceId) {
        const userPermission = await getUserEntityPermissions(
          session.user.id,
          'workspace',
          source.workspaceId
        )
        if (userPermission === 'admin' || userPermission === 'write') {
          canAccessSource = true
        }
      }

      if (!canAccessSource) {
        throw new Error('Source workflow not found or access denied')
      }
      // Create the new workflow first (required for foreign key constraints)
      await tx.insert(workflow).values({
        id: newWorkflowId,
        userId: approvalUserId,
        workspaceId: newWorkspaceId || workspaceId || source.workspaceId,
        folderId: folderId || source.folderId,
        name,
        description: description || source.description,
        color: color || source.color,
        lastSynced: now,
        createdAt: now,
        updatedAt: now,
        isDeployed: false,
        collaborators: [],
        runCount: 0,
        variables: source.variables || {},
        isPublished: false,
        marketplaceData: null,
      })

      // Copy all blocks from source workflow with new IDs
      const sourceBlocks = await tx
        .select()
        .from(workflowBlocks)
        .where(eq(workflowBlocks.workflowId, sourceWorkflowId))

      // Create a mapping from old block IDs to new block IDs
      const blockIdMapping = new Map<string, string>()

      if (sourceBlocks.length > 0) {
        // First pass: Create all block ID mappings
        sourceBlocks.forEach((block) => {
          const newBlockId = crypto.randomUUID()
          blockIdMapping.set(block.id, newBlockId)
        })

        // Second pass: Create blocks with updated parent relationships
        const newBlocks = sourceBlocks.map((block) => {
          const newBlockId = blockIdMapping.get(block.id)!

          // Update parent ID to point to the new parent block ID if it exists
          let newParentId = block.parentId
          if (block.parentId && blockIdMapping.has(block.parentId)) {
            newParentId = blockIdMapping.get(block.parentId)!
          }

          // Update data.parentId and extent if they exist in the data object
          let updatedData = block.data
          let newExtent = block.extent
          if (block.data && typeof block.data === 'object' && !Array.isArray(block.data)) {
            const dataObj = block.data as any
            if (dataObj.parentId && typeof dataObj.parentId === 'string') {
              updatedData = { ...dataObj }
              if (blockIdMapping.has(dataObj.parentId)) {
                ;(updatedData as any).parentId = blockIdMapping.get(dataObj.parentId)!
                // Ensure extent is set to 'parent' for child blocks
                ;(updatedData as any).extent = 'parent'
                newExtent = 'parent'
              }
            }
          }

          return {
            ...block,
            id: newBlockId,
            workflowId: newWorkflowId,
            parentId: newParentId,
            extent: newExtent,
            data: updatedData,
            createdAt: now,
            updatedAt: now,
          }
        })

        await tx.insert(workflowBlocks).values(newBlocks)
        logger.info(
          `[${requestId}] Copied ${sourceBlocks.length} blocks with updated parent relationships`
        )
      }

      // Copy all edges from source workflow with updated block references
      const sourceEdges = await tx
        .select()
        .from(workflowEdges)
        .where(eq(workflowEdges.workflowId, sourceWorkflowId))

      if (sourceEdges.length > 0) {
        const newEdges = sourceEdges.map((edge) => ({
          ...edge,
          id: crypto.randomUUID(), // Generate new edge ID
          workflowId: newWorkflowId,
          sourceBlockId: blockIdMapping.get(edge.sourceBlockId) || edge.sourceBlockId,
          targetBlockId: blockIdMapping.get(edge.targetBlockId) || edge.targetBlockId,
          createdAt: now,
          updatedAt: now,
        }))

        await tx.insert(workflowEdges).values(newEdges)
        logger.info(
          `[${requestId}] Copied ${sourceEdges.length} edges with updated block references`
        )
      }

      // Copy all subflows from source workflow with new IDs and updated block references
      const sourceSubflows = await tx
        .select()
        .from(workflowSubflows)
        .where(eq(workflowSubflows.workflowId, sourceWorkflowId))

      if (sourceSubflows.length > 0) {
        const newSubflows = sourceSubflows
          .map((subflow) => {
            // The subflow ID should match the corresponding block ID
            const newSubflowId = blockIdMapping.get(subflow.id)

            if (!newSubflowId) {
              logger.warn(
                `[${requestId}] Subflow ${subflow.id} (${subflow.type}) has no corresponding block, skipping`
              )
              return null
            }

            logger.info(`[${requestId}] Mapping subflow ${subflow.id} → ${newSubflowId}`, {
              subflowType: subflow.type,
            })

            // Update block references in subflow config
            let updatedConfig: LoopConfig | ParallelConfig = subflow.config as
              | LoopConfig
              | ParallelConfig
            if (subflow.config && typeof subflow.config === 'object') {
              updatedConfig = JSON.parse(JSON.stringify(subflow.config)) as
                | LoopConfig
                | ParallelConfig

              // Update the config ID to match the new subflow ID

              ;(updatedConfig as any).id = newSubflowId

              // Update node references in config if they exist
              if ('nodes' in updatedConfig && Array.isArray(updatedConfig.nodes)) {
                updatedConfig.nodes = updatedConfig.nodes.map(
                  (nodeId: string) => blockIdMapping.get(nodeId) || nodeId
                )
              }
            }

            return {
              ...subflow,
              id: newSubflowId, // Use the same ID as the corresponding block
              workflowId: newWorkflowId,
              config: updatedConfig,
              createdAt: now,
              updatedAt: now,
            }
          })
          .filter((subflow): subflow is NonNullable<typeof subflow> => subflow !== null)

        if (newSubflows.length > 0) {
          await tx.insert(workflowSubflows).values(newSubflows)
        }

        logger.info(
          `[${requestId}] Copied ${newSubflows.length}/${sourceSubflows.length} subflows with updated block references and matching IDs`,
          {
            subflowMappings: newSubflows.map((sf) => ({
              oldId: sourceSubflows.find((s) => blockIdMapping.get(s.id) === sf.id)?.id,
              newId: sf.id,
              type: sf.type,
              config: sf.config,
            })),
            blockIdMappings: Array.from(blockIdMapping.entries()).map(([oldId, newId]) => ({
              oldId,
              newId,
            })),
          }
        )
      }

      // Update the workflow timestamp
      await tx
        .update(workflow)
        .set({
          updatedAt: now,
        })
        .where(eq(workflow.id, newWorkflowId))

      return {
        id: newWorkflowId,
        name,
        description: description || source.description,
        color: color || source.color,
        workspaceId: newWorkspaceId || workspaceId || source.workspaceId,
        folderId: folderId || source.folderId,
        blocksCount: sourceBlocks.length,
        edgesCount: sourceEdges.length,
        subflowsCount: sourceSubflows.length,
      }
    })

    const elapsed = Date.now() - startTime
    logger.info(
      `[${requestId}] Successfully approved workflow ${sourceWorkflowId} to ${newWorkflowId} in ${elapsed}ms`
    )
    // Check if there's an existing approval status for this workflow
    const existingApprovalStatus = await db
      .select()
      .from(workflowStatus)
      .where(
        and(
          eq(workflowStatus.workflowId, newWorkflowId),
          eq(workflowStatus.mappedWorkflowId, sourceWorkflowId)
        )
      )
      .orderBy(desc(workflowStatus.updatedAt))
      .limit(1)

    if (existingApprovalStatus.length > 0) {
      // Update existing approval status
      await db
        .update(workflowStatus)
        .set({
          name,
          userId: approvalUserId,
          status: 'PENDING',
          updatedAt: new Date(),
        })
        .where(eq(workflowStatus.id, existingApprovalStatus[0].id))
    } else {
      // Create new approval status
      const workflowStatusId = crypto.randomUUID()
      await db.insert(workflowStatus).values({
        id: workflowStatusId,
        name,
        workflowId: newWorkflowId,
        mappedWorkflowId: sourceWorkflowId,
        ownerId: session.user.id,
        userId: approvalUserId,
        status: 'PENDING',
        description: description || null,
        category: category || 'creative',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }
    return NextResponse.json(result, { status: 201 })
  } catch (error) {
    console.log(error)
    if (error instanceof Error) {
      if (error.message === 'Source workflow not found') {
        logger.warn(`[${requestId}] Source workflow ${sourceWorkflowId} not found`)
        return NextResponse.json({ error: 'Source workflow not found' }, { status: 404 })
      }

      if (error.message === 'Source workflow not found or access denied') {
        logger.warn(
          `[${requestId}] User ${session.user.id} denied access to source workflow ${sourceWorkflowId}`
        )
        return NextResponse.json({ error: 'Access denied' }, { status: 403 })
      }
    }

    if (error instanceof z.ZodError) {
      logger.warn(`[${requestId}] Invalid duplication request data`, { errors: error.errors })
      return NextResponse.json(
        { error: 'Invalid request data', details: error.errors },
        { status: 400 }
      )
    }

    const elapsed = Date.now() - startTime
    logger.error(
      `[${requestId}] Error duplicating workflow ${sourceWorkflowId} after ${elapsed}ms:`,
      error
    )
    return NextResponse.json({ error: 'Failed to approval workflow' }, { status: 500 })
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: workflowId } = await params
  const session = await getSession()
  if (!session?.user?.id) {
    logger.warn(`Unauthorized workflow duplication attempt for ${workflowId}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const getWorkflowApproval = await db.transaction(async (tx) => {
    // First, check if this is a workflow in the AGENTS APPROVAL (copied workflow)
    // by looking for a workflowStatus record where mappedWorkflowId = workflowId
    const approvalListStatus = await tx
      .select()
      .from(workflowStatus)
      .where(
        and(
          eq(workflowStatus.workflowId, workflowId), // This is the AGENTS APPROVAL copy
          or(
            eq(workflowStatus.userId, session.user.id),
            eq(workflowStatus.ownerId, session.user.id)
          )
        )
      )
      .orderBy(desc(workflowStatus.updatedAt))
      .limit(1)

    if (approvalListStatus.length > 0) {
      // This is a workflow in the AGENTS APPROVAL, return its status
      console.log('Found AGENTS APPROVAL workflow status:', approvalListStatus[0])
      return approvalListStatus[0]
    }

    // If not found, check if this is an original workflow by looking for mappedWorkflowId
    const originalWorkflowStatus = await tx
      .select()
      .from(workflowStatus)
      .where(
        and(
          eq(workflowStatus.mappedWorkflowId, workflowId), // This is the original workflow
          or(
            eq(workflowStatus.userId, session.user.id),
            eq(workflowStatus.ownerId, session.user.id)
          )
        )
      )
      .orderBy(desc(workflowStatus.updatedAt))
      .limit(1)

    if (originalWorkflowStatus.length > 0) {
      console.log('Found original workflow status:', originalWorkflowStatus[0])
      return originalWorkflowStatus[0]
    }

    // No approval status found
    console.log('No approval status found for workflow:', workflowId)
    return { status: 'NO_APPROVAL_REQUEST', ownerId: session.user.id }
  })

  return NextResponse.json(getWorkflowApproval, { status: 201 })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: sourceWorkflowId } = await params
  const requestId = crypto.randomUUID().slice(0, 8)
  const startTime = Date.now()

  const session = await getSession()
  if (!session?.user?.id) {
    logger.warn(`[${requestId}] Unauthorized workflow duplication attempt for ${sourceWorkflowId}`)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { statusId, action, reason } = body
    const now = new Date()

    if (action === 'APPROVED' || action === 'REJECTED') {
      const result = await db.transaction(async (tx) => {
        // First verify the source workflow exists
        const sourceWorkflow = await tx
          .select()
          .from(workflow)
          .where(eq(workflow.id, sourceWorkflowId))
          .limit(1)
        const userWorkflowStatus = await tx
          .select()
          .from(workflowStatus)
          .where(
            and(
              eq(workflowStatus.workflowId, sourceWorkflowId),
              eq(workflowStatus.userId, session.user.id)
            )
          )
          .limit(1)
        if (sourceWorkflow.length === 0) {
          throw new Error('Source workflow not found')
        }

        // If the mapped (approver's) workflow is already deployed, do not rewrite its graph.
        // This avoids introducing structural changes on approval for already-deployed agents.
        const mappedWorkflow = await tx
          .select({ isDeployed: workflow.isDeployed })
          .from(workflow)
          .where(eq(workflow.id, userWorkflowStatus[0].mappedWorkflowId))
          .limit(1)

        const shouldRewriteGraph = !(mappedWorkflow[0]?.isDeployed === true)

        if (!shouldRewriteGraph) {
          // Only bump updatedAt to reflect approval action; skip deletes/inserts below
          await tx
            .update(workflow)
            .set({ updatedAt: now })
            .where(eq(workflow.id, userWorkflowStatus[0].mappedWorkflowId))
          return
        }

        // Delete the blocks and edges of the older data (only if not deployed)
        await tx
          .delete(workflowBlocks)
          .where(eq(workflowBlocks.workflowId, userWorkflowStatus[0].mappedWorkflowId))
        await tx
          .delete(workflowEdges)
          .where(eq(workflowEdges.workflowId, userWorkflowStatus[0].mappedWorkflowId))
        await tx
          .delete(workflowSubflows)
          .where(eq(workflowSubflows.workflowId, userWorkflowStatus[0].mappedWorkflowId))

        // Copy all blocks from source workflow with new IDs
        const sourceBlocks = await tx
          .select()
          .from(workflowBlocks)
          .where(eq(workflowBlocks.workflowId, sourceWorkflowId))

        // Create a mapping from old block IDs to new block IDs
        const blockIdMapping = new Map<string, string>()

        if (sourceBlocks.length > 0) {
          // First pass: Create all block ID mappings
          sourceBlocks.forEach((block) => {
            const newBlockId = crypto.randomUUID()
            blockIdMapping.set(block.id, newBlockId)
          })

          // Second pass: Create blocks with updated parent relationships
          const newBlocks = sourceBlocks.map((block) => {
            const newBlockId = blockIdMapping.get(block.id)!

            // Update parent ID to point to the new parent block ID if it exists
            let newParentId = block.parentId
            if (block.parentId && blockIdMapping.has(block.parentId)) {
              newParentId = blockIdMapping.get(block.parentId)!
            }

            // Update data.parentId and extent if they exist in the data object
            let updatedData = block.data
            let newExtent = block.extent
            if (block.data && typeof block.data === 'object' && !Array.isArray(block.data)) {
              const dataObj = block.data as any
              if (dataObj.parentId && typeof dataObj.parentId === 'string') {
                updatedData = { ...dataObj }
                if (blockIdMapping.has(dataObj.parentId)) {
                  ;(updatedData as any).parentId = blockIdMapping.get(dataObj.parentId)!
                  // Ensure extent is set to 'parent' for child blocks
                  ;(updatedData as any).extent = 'parent'
                  newExtent = 'parent'
                }
              }
            }
            return {
              ...block,
              id: newBlockId,
              workflowId: userWorkflowStatus[0].mappedWorkflowId,
              parentId: newParentId,
              extent: newExtent,
              data: updatedData,
              createdAt: now,
              updatedAt: now,
            }
          })

          await tx.insert(workflowBlocks).values(newBlocks)
          logger.info(
            `[${requestId}] Copied ${sourceBlocks.length} blocks with updated parent relationships`
          )
        }

        // Copy all edges from source workflow with updated block references
        const sourceEdges = await tx
          .select()
          .from(workflowEdges)
          .where(eq(workflowEdges.workflowId, sourceWorkflowId))

        if (sourceEdges.length > 0) {
          const newEdges = sourceEdges.map((edge) => ({
            ...edge,
            id: crypto.randomUUID(), // Generate new edge ID
            workflowId: userWorkflowStatus[0].mappedWorkflowId,
            sourceBlockId: blockIdMapping.get(edge.sourceBlockId) || edge.sourceBlockId,
            targetBlockId: blockIdMapping.get(edge.targetBlockId) || edge.targetBlockId,
            createdAt: now,
            updatedAt: now,
          }))

          await tx.insert(workflowEdges).values(newEdges)
          logger.info(
            `[${requestId}] Copied ${sourceEdges.length} edges with updated block references`
          )
        }

        // Copy all subflows from source workflow with new IDs and updated block references
        const sourceSubflows = await tx
          .select()
          .from(workflowSubflows)
          .where(eq(workflowSubflows.workflowId, sourceWorkflowId))

        if (sourceSubflows.length > 0) {
          const newSubflows = sourceSubflows
            .map((subflow) => {
              // The subflow ID should match the corresponding block ID
              const newSubflowId = blockIdMapping.get(subflow.id)

              if (!newSubflowId) {
                logger.warn(
                  `[${requestId}] Subflow ${subflow.id} (${subflow.type}) has no corresponding block, skipping`
                )
                return null
              }

              logger.info(`[${requestId}] Mapping subflow ${subflow.id} → ${newSubflowId}`, {
                subflowType: subflow.type,
              })

              // Update block references in subflow config
              let updatedConfig: LoopConfig | ParallelConfig = subflow.config as
                | LoopConfig
                | ParallelConfig
              if (subflow.config && typeof subflow.config === 'object') {
                updatedConfig = JSON.parse(JSON.stringify(subflow.config)) as
                  | LoopConfig
                  | ParallelConfig

                // Update the config ID to match the new subflow ID

                ;(updatedConfig as any).id = newSubflowId

                // Update node references in config if they exist
                if ('nodes' in updatedConfig && Array.isArray(updatedConfig.nodes)) {
                  updatedConfig.nodes = updatedConfig.nodes.map(
                    (nodeId: string) => blockIdMapping.get(nodeId) || nodeId
                  )
                }
              }

              return {
                ...subflow,
                id: newSubflowId, // Use the same ID as the corresponding block
                workflowId: userWorkflowStatus[0].mappedWorkflowId,
                config: updatedConfig,
                createdAt: now,
                updatedAt: now,
              }
            })
            .filter((subflow): subflow is NonNullable<typeof subflow> => subflow !== null)

          if (newSubflows.length > 0) {
            await tx.insert(workflowSubflows).values(newSubflows)
          }

          logger.info(
            `[${requestId}] Copied ${newSubflows.length}/${sourceSubflows.length} subflows with updated block references and matching IDs`,
            {
              subflowMappings: newSubflows.map((sf) => ({
                oldId: sourceSubflows.find((s) => blockIdMapping.get(s.id) === sf.id)?.id,
                newId: sf.id,
                type: sf.type,
                config: sf.config,
              })),
              blockIdMappings: Array.from(blockIdMapping.entries()).map(([oldId, newId]) => ({
                oldId,
                newId,
              })),
            }
          )
        }

        // Update the workflow timestamp
        await tx
          .update(workflow)
          .set({
            updatedAt: now,
          })
          .where(eq(workflow.id, userWorkflowStatus[0].mappedWorkflowId))
      })
    }
    const getWorkflowApproval = await db.transaction(async (tx) => {
      // Find the latest approval status by updatedAt
      const latestApprovalStatus = await tx
        .select()
        .from(workflowStatus)
        .where(
          and(
            eq(workflowStatus.workflowId, sourceWorkflowId),
            eq(workflowStatus.userId, session.user.id)
          )
        )
        .orderBy(desc(workflowStatus.updatedAt))
        .limit(1)

      if (latestApprovalStatus.length === 0) {
        throw new Error('No approval status found for this workflow')
      }

      // Update the latest approval status
      await tx
        .update(workflowStatus)
        .set({
          updatedAt: now,
          status: action,
          comments: reason,
        })
        .where(eq(workflowStatus.id, latestApprovalStatus[0].id))

      const userWorkflowStatus = await tx
        .select()
        .from(workflowStatus)
        .where(eq(workflowStatus.id, latestApprovalStatus[0].id))
        .limit(1)

      console.log('userWorkflowStatus data:', userWorkflowStatus[0])

      // Only create template when approved, not when rejected
      if (action === 'APPROVED') {
        /**
         * Create or update template for the approval workflow
         * Use the original workflow ID (sourceWorkflowId) to track templates
         * This ensures we update the same template when the owner makes changes
         */
        const workflowData = await tx
          .select()
          .from(workflow)
          .where(eq(workflow.id, userWorkflowStatus[0].mappedWorkflowId))
          .then((rows) => rows[0])
        console.log('workflowData', workflowData)

        // Get the owner's details for the author field
        const ownerData = await tx
          .select()
          .from(user)
          .where(eq(user.id, userWorkflowStatus[0].ownerId))
          .limit(1)

        // Load data from ORIGINAL workflow (not the AGENTS APPROVAL copy)
        const normalizedData = await loadWorkflowFromNormalizedTables(
          userWorkflowStatus[0].mappedWorkflowId // Original workflow ID
        )

        // Check if a template already exists for this original workflow
        // Use userWorkflowStatus[0].workflowId which is the original owner's workflow ID
        const existingTemplate = await tx
          .select()
          .from(templates)
          .where(eq(templates.workflowId, userWorkflowStatus[0].mappedWorkflowId))
          .limit(1)

        // Debug: Check all templates to see what's in the database
        const allTemplates = await tx.select().from(templates).limit(10)

        const templateState = {
          blocks: normalizedData?.blocks,
          edges: normalizedData?.edges,
          loops: normalizedData?.loops,
          parallels: normalizedData?.parallels,
          lastSaved: now,
        }

        if (existingTemplate.length > 0) {
          // Update existing template with new data
          const updateResult = await tx
            .update(templates)
            .set({
              name: userWorkflowStatus[0].name,
              description: userWorkflowStatus[0].description || '',
              author: ownerData[0]?.name || session.user.name,
              category: userWorkflowStatus[0].category || 'creative',
              state: templateState,
              updatedAt: now,
            })
            .where(eq(templates.id, existingTemplate[0].id))
        } else {
          // Create new template if none exists
          const templateId = uuidv4()
          const newTemplate = {
            id: templateId,
            workflowId: userWorkflowStatus[0].mappedWorkflowId, // Use original owner's workflow ID
            userId: userWorkflowStatus[0].ownerId, // Use original owner's userId
            name: userWorkflowStatus[0].name,
            description: userWorkflowStatus[0].description || '',
            author: ownerData[0]?.name || session.user.name,
            views: 0,
            stars: 0,
            color: '#3972F6',
            icon: 'FileText',
            category: userWorkflowStatus[0].category || 'creative',
            state: templateState,
            createdAt: now,
            updatedAt: now,
          }

          await tx.insert(templates).values(newTemplate)
          console.log('🆕 Created new template with ID:', templateId)
        }

        // Final verification - check template for this workflow
        const finalTemplate = await tx
          .select()
          .from(templates)
          .where(eq(templates.workflowId, userWorkflowStatus[0].mappedWorkflowId))
          .limit(1)

        console.log('📊 Final template check for workflow:', {
          found: finalTemplate.length > 0,
          id: finalTemplate[0]?.id,
          name: finalTemplate[0]?.name,
          updatedAt: finalTemplate[0]?.updatedAt,
        })
      }

      return userWorkflowStatus[0]
    })

    // Debug: Check if template was actually updated after transaction
    // We need to get the userWorkflowStatus again to get the original workflow ID
    const finalUserWorkflowStatus = await db
      .select()
      .from(workflowStatus)
      .where(
        and(
          eq(workflowStatus.workflowId, sourceWorkflowId),
          eq(workflowStatus.userId, session.user.id)
        )
      )
      .orderBy(desc(workflowStatus.updatedAt))
      .limit(1)

    const finalTemplateCheck = await db
      .select()
      .from(templates)
      .where(eq(templates.workflowId, finalUserWorkflowStatus[0].mappedWorkflowId))
      .limit(1)

    console.log('Final template check after transaction:', {
      found: finalTemplateCheck.length > 0,
      id: finalTemplateCheck[0]?.id,
      name: finalTemplateCheck[0]?.name,
      workflowId: finalTemplateCheck[0]?.workflowId,
      createdAt: finalTemplateCheck[0]?.createdAt,
    })

    return NextResponse.json(getWorkflowApproval, { status: 201 })
  } catch (error) {
    logger.error(`[${requestId}] Error approving workflow ${sourceWorkflowId}:`, error)
    return NextResponse.json({ error: 'Failed to approval workflow' }, { status: 500 })
  }
}

import { AuditAction, AuditResourceType, recordAudit } from '@sim/audit'
import { db } from '@sim/db'
import { apiKey, permissions, user, workflow, workspace } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { generateId, generateShortId } from '@sim/utils/id'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { createApiKey } from '@/lib/api-key/auth'
import { hashApiKey } from '@/lib/api-key/crypto'
import { generateRequestId } from '@/lib/core/utils/request'
import { extractWorkflowName, parseWorkflowJson } from '@/lib/workflows/operations/import-export'
import { performFullDeploy } from '@/lib/workflows/orchestration'
import { saveWorkflowToNormalizedTables } from '@/lib/workflows/persistence/utils'
import { deduplicateWorkflowName } from '@/lib/workflows/utils'
import { getRandomWorkspaceColor } from '@/lib/workspaces/colors'
import { withAdminAuth } from '@/app/api/v1/admin/middleware'
import {
  badRequestResponse,
  internalErrorResponse,
  notFoundResponse,
  singleResponse,
} from '@/app/api/v1/admin/responses'

const logger = createLogger('AdminImportDeployWorkflowsAPI')

const DEFAULT_API_KEY_NAME = 'Personal API key'
const DEFAULT_WORKFLOW_COLOR = '#3972F6'

interface WorkflowInput {
  content: string
  filename: string
  nameOverride?: string
}

interface ImportedWorkflowResult {
  workflowId: string
  name: string
  imported: boolean
  deployed: boolean
  version?: number
  deployedAt?: string
  warnings?: string[]
  error?: string
}

interface ImportDeployResponse {
  userId: string
  emailId: string
  workspace: {
    id: string
    created: boolean
  }
  apiKey: {
    exists: boolean
    created: boolean
  }
  imported: number
  deployed: number
  failed: number
  results: ImportedWorkflowResult[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function getWorkflowInputs(body: Record<string, unknown>): {
  inputs?: WorkflowInput[]
  error?: string
} {
  const rawWorkflows = Array.isArray(body.workflows)
    ? body.workflows
    : body.workflow || body.workflowJson
      ? [body.workflow ?? body.workflowJson]
      : []

  if (rawWorkflows.length === 0) {
    return { error: 'Provide workflow or workflows in the request body.' }
  }

  const inputs: WorkflowInput[] = []

  for (const [index, rawWorkflow] of rawWorkflows.entries()) {
    const normalized = normalizeWorkflowInput(rawWorkflow, index)
    if ('error' in normalized) {
      return normalized
    }
    inputs.push(normalized)
  }

  return { inputs }
}

function normalizeWorkflowInput(
  rawWorkflow: unknown,
  index: number
): WorkflowInput | { error: string } {
  const payload =
    isRecord(rawWorkflow) && ('content' in rawWorkflow || 'workflow' in rawWorkflow)
      ? (rawWorkflow.content ?? rawWorkflow.workflow)
      : rawWorkflow

  const nameOverride =
    isRecord(rawWorkflow) && typeof rawWorkflow.name === 'string' && rawWorkflow.name.trim()
      ? rawWorkflow.name.trim()
      : undefined

  if (typeof payload === 'string') {
    return {
      content: payload,
      filename: nameOverride ? `${nameOverride}.json` : `workflow-${index + 1}.json`,
      nameOverride,
    }
  }

  if (isRecord(payload)) {
    return {
      content: JSON.stringify(payload),
      filename: nameOverride ? `${nameOverride}.json` : `workflow-${index + 1}.json`,
      nameOverride,
    }
  }

  return { error: `Workflow at index ${index} must be a JSON object or string.` }
}

function getWorkflowMetadata(content: string, filename: string, nameOverride?: string) {
  const name = nameOverride || extractWorkflowName(content, filename)

  try {
    const parsed = JSON.parse(content)
    const state = isRecord(parsed.state) ? parsed.state : parsed
    const metadata = isRecord(state.metadata) ? state.metadata : {}

    return {
      name,
      description:
        typeof metadata.description === 'string' ? metadata.description : 'Imported via Admin API',
      color: typeof metadata.color === 'string' ? metadata.color : DEFAULT_WORKFLOW_COLOR,
    }
  } catch {
    return {
      name,
      description: 'Imported via Admin API',
      color: DEFAULT_WORKFLOW_COLOR,
    }
  }
}

async function getOrCreatePersonalWorkspace(params: {
  userId: string
  userName: string
  request: Request
}): Promise<{ workspaceId: string; created: boolean }> {
  const [existingWorkspace] = await db
    .select({ id: workspace.id })
    .from(workspace)
    .where(
      and(
        eq(workspace.ownerId, params.userId),
        eq(workspace.workspaceMode, 'personal'),
        isNull(workspace.archivedAt)
      )
    )
    .limit(1)

  if (existingWorkspace) {
    return { workspaceId: existingWorkspace.id, created: false }
  }

  const workspaceId = generateId()
  const now = new Date()
  const firstName = params.userName.split(' ')[0]?.trim()
  const workspaceName = firstName ? `${firstName}'s Workspace` : 'My Workspace'

  await db.transaction(async (tx) => {
    await tx.insert(workspace).values({
      id: workspaceId,
      name: workspaceName,
      color: getRandomWorkspaceColor(),
      ownerId: params.userId,
      organizationId: null,
      workspaceMode: 'personal',
      billedAccountUserId: params.userId,
      allowPersonalApiKeys: true,
      createdAt: now,
      updatedAt: now,
    })

    await tx.insert(permissions).values({
      id: generateId(),
      entityType: 'workspace',
      entityId: workspaceId,
      userId: params.userId,
      permissionType: 'admin',
      createdAt: now,
      updatedAt: now,
    })
  })

  recordAudit({
    workspaceId,
    actorId: 'admin-api',
    actorName: 'Admin API',
    actorEmail: undefined,
    action: AuditAction.WORKSPACE_CREATED,
    resourceType: AuditResourceType.WORKSPACE,
    resourceId: workspaceId,
    resourceName: workspaceName,
    description: `Created personal workspace "${workspaceName}"`,
    metadata: { userId: params.userId, workspaceMode: 'personal' },
    request: params.request,
  })

  return { workspaceId, created: true }
}

async function ensurePersonalApiKey(params: {
  userId: string
  userEmail: string
  userName: string
  keyName: string
  request: Request
}): Promise<{ exists: boolean; created: boolean }> {
  const [existingKey] = await db
    .select({ id: apiKey.id })
    .from(apiKey)
    .where(
      and(eq(apiKey.userId, params.userId), eq(apiKey.type, 'personal'), isNull(apiKey.workspaceId))
    )
    .limit(1)

  if (existingKey) {
    return { exists: true, created: false }
  }

  const { key: plainKey, encryptedKey } = await createApiKey(true)
  if (!encryptedKey) {
    throw new Error('Failed to encrypt API key for storage')
  }

  const [newKey] = await db
    .insert(apiKey)
    .values({
      id: generateShortId(),
      userId: params.userId,
      workspaceId: null,
      createdBy: null,
      name: params.keyName,
      key: encryptedKey,
      keyHash: hashApiKey(plainKey),
      type: 'personal',
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: apiKey.id })

  recordAudit({
    workspaceId: null,
    actorId: 'admin-api',
    action: AuditAction.PERSONAL_API_KEY_CREATED,
    resourceType: AuditResourceType.API_KEY,
    resourceId: newKey.id,
    actorName: 'Admin API',
    actorEmail: undefined,
    resourceName: params.keyName,
    description: `Created personal API key for ${params.userEmail}`,
    metadata: { userId: params.userId, userName: params.userName },
    request: params.request,
  })

  return { exists: true, created: true }
}

async function importWorkflow(params: {
  input: WorkflowInput
  workspaceId: string
  userId: string
}): Promise<{ workflowId: string; name: string }> {
  const { data: workflowData, errors } = parseWorkflowJson(params.input.content)

  if (!workflowData || errors.length > 0) {
    throw new Error(`Parse error: ${errors.join(', ')}`)
  }

  const metadata = getWorkflowMetadata(
    params.input.content,
    params.input.filename,
    params.input.nameOverride
  )
  const workflowId = generateId()
  const now = new Date()
  const dedupedName = await deduplicateWorkflowName(metadata.name, params.workspaceId, null)

  await db.insert(workflow).values({
    id: workflowId,
    userId: params.userId,
    workspaceId: params.workspaceId,
    folderId: null,
    name: dedupedName,
    description: metadata.description,
    color: metadata.color,
    lastSynced: now,
    createdAt: now,
    updatedAt: now,
    isDeployed: false,
    runCount: 0,
    variables: workflowData.variables ?? {},
  })

  const saveResult = await saveWorkflowToNormalizedTables(workflowId, workflowData)
  if (!saveResult.success) {
    await db.delete(workflow).where(eq(workflow.id, workflowId))
    throw new Error(`Failed to save workflow state: ${saveResult.error}`)
  }

  return { workflowId, name: dedupedName }
}

export const POST = withAdminAuth(async (request) => {
  const requestId = generateRequestId()

  try {
    const body: unknown = await request.json()
    if (!isRecord(body)) {
      return badRequestResponse('Request body must be a JSON object.')
    }

    const emailId = typeof body.emailId === 'string' ? body.emailId.trim().toLowerCase() : ''
    if (!emailId) {
      return badRequestResponse('emailId is required.')
    }

    const { inputs, error } = getWorkflowInputs(body)
    if (error || !inputs) {
      return badRequestResponse(error || 'Invalid workflow input.')
    }

    const apiKeyName =
      typeof body.apiKeyName === 'string' && body.apiKeyName.trim()
        ? body.apiKeyName.trim()
        : DEFAULT_API_KEY_NAME

    const [targetUser] = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(sql`lower(${user.email}) = ${emailId}`)
      .limit(1)

    if (!targetUser) {
      return notFoundResponse('User')
    }

    const personalWorkspace = await getOrCreatePersonalWorkspace({
      userId: targetUser.id,
      userName: targetUser.name,
      request,
    })

    const apiKeyResult = await ensurePersonalApiKey({
      userId: targetUser.id,
      userEmail: targetUser.email,
      userName: targetUser.name,
      keyName: apiKeyName,
      request,
    })

    const results: ImportedWorkflowResult[] = []

    for (const input of inputs) {
      try {
        const importedWorkflow = await importWorkflow({
          input,
          workspaceId: personalWorkspace.workspaceId,
          userId: targetUser.id,
        })

        const deployResult = await performFullDeploy({
          workflowId: importedWorkflow.workflowId,
          userId: targetUser.id,
          workflowName: importedWorkflow.name,
          requestId,
          request,
          actorId: 'admin-api',
        })

        if (!deployResult.success) {
          results.push({
            workflowId: importedWorkflow.workflowId,
            name: importedWorkflow.name,
            imported: true,
            deployed: false,
            error: deployResult.error || 'Failed to deploy workflow',
          })
          continue
        }

        results.push({
          workflowId: importedWorkflow.workflowId,
          name: importedWorkflow.name,
          imported: true,
          deployed: true,
          version: deployResult.version,
          deployedAt: deployResult.deployedAt?.toISOString(),
          warnings: deployResult.warnings,
        })
      } catch (error) {
        results.push({
          workflowId: '',
          name: input.nameOverride || input.filename,
          imported: false,
          deployed: false,
          error: toError(error).message,
        })
      }
    }

    const response: ImportDeployResponse = {
      userId: targetUser.id,
      emailId,
      workspace: {
        id: personalWorkspace.workspaceId,
        created: personalWorkspace.created,
      },
      apiKey: apiKeyResult,
      imported: results.filter((result) => result.imported).length,
      deployed: results.filter((result) => result.deployed).length,
      failed: results.filter((result) => result.error).length,
      results,
    }

    logger.info(`[${requestId}] Admin API: Imported and deployed workflows for user`, {
      userId: targetUser.id,
      workspaceId: personalWorkspace.workspaceId,
      imported: response.imported,
      deployed: response.deployed,
      failed: response.failed,
    })

    return singleResponse(response)
  } catch (error) {
    logger.error(`[${requestId}] Admin API: Failed to import and deploy workflows`, { error })
    return internalErrorResponse('Failed to import and deploy workflows')
  }
})

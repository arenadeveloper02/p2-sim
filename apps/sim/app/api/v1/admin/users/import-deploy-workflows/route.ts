import { AuditAction, AuditResourceType, recordAudit } from '@sim/audit'
import { db } from '@sim/db'
import { apiKey, permissions, user, workspace } from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { generateId, generateShortId } from '@sim/utils/id'
import { and, eq, isNull, sql } from 'drizzle-orm'
import { createApiKey } from '@/lib/api-key/auth'
import { hashApiKey } from '@/lib/api-key/crypto'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { parsePostgresConnectionFromBody } from '@/lib/workflows/default-user-workflows/postgres'
import {
  type DefaultWorkflowSourceInput,
  getOldestActiveCredentialsByProvider,
  provisionOrRefreshDefaultUserWorkflow,
  recordDefaultUserWorkflowDeploy,
} from '@/lib/workflows/default-user-workflows/service'
import { performFullDeploy } from '@/lib/workflows/orchestration'
import { getRandomWorkspaceColor } from '@/lib/workspaces/colors'
import { authenticateCronSecretRequest } from '@/app/api/v1/admin/cron-secret-auth'
import {
  badRequestResponse,
  internalErrorResponse,
  notFoundResponse,
  singleResponse,
} from '@/app/api/v1/admin/responses'

const logger = createLogger('AdminImportDeployWorkflowsAPI')

const DEFAULT_API_KEY_NAME = 'Personal API key'

interface ImportedWorkflowResult {
  workflowId: string
  name: string
  created: boolean
  refreshed: boolean
  imported: boolean
  deployed: boolean
  credentialPopulation?: {
    populatedProviders: string[]
    missingProviders: string[]
  }
  postgresBlocksPopulated?: number
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

function getSourceWorkflowInputs(body: Record<string, unknown>): {
  inputs?: DefaultWorkflowSourceInput[]
  error?: string
} {
  const rawWorkflows = Array.isArray(body.sourceWorkflowIds)
    ? body.sourceWorkflowIds
    : Array.isArray(body.workflows)
      ? body.workflows
      : body.sourceWorkflowId
        ? [body.sourceWorkflowId]
        : []

  if (rawWorkflows.length === 0) {
    return { error: 'Provide sourceWorkflowId or sourceWorkflowIds in the request body.' }
  }

  const inputs: DefaultWorkflowSourceInput[] = []

  for (const [index, rawWorkflow] of rawWorkflows.entries()) {
    const normalized = normalizeSourceWorkflowInput(rawWorkflow, index)
    if ('error' in normalized) {
      return normalized
    }
    inputs.push(normalized)
  }

  return { inputs }
}

function normalizeSourceWorkflowInput(
  rawWorkflow: unknown,
  index: number
): DefaultWorkflowSourceInput | { error: string } {
  const nameOverride =
    isRecord(rawWorkflow) && typeof rawWorkflow.name === 'string' && rawWorkflow.name.trim()
      ? rawWorkflow.name.trim()
      : undefined

  const sourceWorkflowId =
    isRecord(rawWorkflow) && typeof rawWorkflow.sourceWorkflowId === 'string'
      ? rawWorkflow.sourceWorkflowId.trim()
      : typeof rawWorkflow === 'string'
        ? rawWorkflow.trim()
        : ''

  if (!sourceWorkflowId) {
    return { error: `Source workflow at index ${index} must be a workflow ID string.` }
  }

  return { sourceWorkflowId, nameOverride }
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

export const POST = withRouteHandler(async (request) => {
  const requestId = generateRequestId()

  try {
    const authResponse = authenticateCronSecretRequest(request)
    if (authResponse) {
      return authResponse
    }

    const body: unknown = await request.json()
    if (!isRecord(body)) {
      return badRequestResponse('Request body must be a JSON object.')
    }

    const emailId = typeof body.emailId === 'string' ? body.emailId.trim().toLowerCase() : ''
    if (!emailId) {
      return badRequestResponse('emailId is required.')
    }

    const { inputs, error } = getSourceWorkflowInputs(body)
    if (error || !inputs) {
      return badRequestResponse(error || 'Invalid workflow input.')
    }

    const postgresParsed = parsePostgresConnectionFromBody(body)
    if (postgresParsed && 'error' in postgresParsed) {
      return badRequestResponse(postgresParsed.error)
    }
    const postgresConnection = postgresParsed

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
    const credentialsByProvider = await getOldestActiveCredentialsByProvider({
      workspaceId: personalWorkspace.workspaceId,
      userId: targetUser.id,
    })

    const results: ImportedWorkflowResult[] = []

    for (const input of inputs) {
      try {
        const provisioned = await provisionOrRefreshDefaultUserWorkflow({
          input,
          workspaceId: personalWorkspace.workspaceId,
          userId: targetUser.id,
          credentialsByProvider,
          postgresConnection,
        })

        const deployResult = await performFullDeploy({
          workflowId: provisioned.workflowId,
          userId: targetUser.id,
          workflowName: provisioned.name,
          requestId,
          request,
          actorId: 'admin-api',
        })

        if (!deployResult.success) {
          results.push({
            workflowId: provisioned.workflowId,
            name: provisioned.name,
            created: provisioned.created,
            refreshed: provisioned.refreshed,
            imported: true,
            deployed: false,
            credentialPopulation: provisioned.credentialPopulation,
            postgresBlocksPopulated: provisioned.postgresBlocksPopulated,
            error: deployResult.error || 'Failed to deploy workflow',
          })
          continue
        }

        await recordDefaultUserWorkflowDeploy({
          userId: targetUser.id,
          sourceWorkflowId: input.sourceWorkflowId,
          version: deployResult.version,
        })

        results.push({
          workflowId: provisioned.workflowId,
          name: provisioned.name,
          created: provisioned.created,
          refreshed: provisioned.refreshed,
          imported: true,
          deployed: true,
          credentialPopulation: provisioned.credentialPopulation,
          postgresBlocksPopulated: provisioned.postgresBlocksPopulated,
          version: deployResult.version,
          deployedAt: deployResult.deployedAt?.toISOString(),
          warnings: deployResult.warnings,
        })
      } catch (error) {
        results.push({
          workflowId: '',
          name: input.nameOverride || input.sourceWorkflowId,
          created: false,
          refreshed: false,
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

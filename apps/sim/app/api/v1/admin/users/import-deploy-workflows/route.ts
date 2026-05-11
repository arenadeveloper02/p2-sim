import { AuditAction, AuditResourceType, recordAudit } from '@sim/audit'
import { db } from '@sim/db'
import {
  apiKey,
  credential,
  credentialMember,
  permissions,
  user,
  workflow,
  workspace,
} from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { safeCompare } from '@sim/security/compare'
import { toError } from '@sim/utils/errors'
import { generateId, generateShortId } from '@sim/utils/id'
import { and, asc, eq, isNull, sql } from 'drizzle-orm'
import { createApiKey } from '@/lib/api-key/auth'
import { hashApiKey } from '@/lib/api-key/crypto'
import { env } from '@/lib/core/config/env'
import { generateRequestId } from '@/lib/core/utils/request'
import { withRouteHandler } from '@/lib/core/utils/with-route-handler'
import { parseWorkflowJson } from '@/lib/workflows/operations/import-export'
import { performFullDeploy } from '@/lib/workflows/orchestration'
import {
  loadWorkflowFromNormalizedTables,
  saveWorkflowToNormalizedTables,
} from '@/lib/workflows/persistence/utils'
import { sanitizeForExport } from '@/lib/workflows/sanitization/json-sanitizer'
import { deduplicateWorkflowName } from '@/lib/workflows/utils'
import { getRandomWorkspaceColor } from '@/lib/workspaces/colors'
import {
  badRequestResponse,
  errorResponse,
  internalErrorResponse,
  notFoundResponse,
  singleResponse,
} from '@/app/api/v1/admin/responses'

const logger = createLogger('AdminImportDeployWorkflowsAPI')

const DEFAULT_API_KEY_NAME = 'Personal API key'
const DEFAULT_WORKFLOW_COLOR = '#3972F6'
const PROVIDER_BY_TOOL_TYPE: Record<string, string> = {
  gmail: 'google-email',
  gmail_v2: 'google-email',
  google_calendar: 'google-calendar',
  google_drive: 'google-drive',
  slack: 'slack',
} as const

const PROVIDER_BY_TOOL_ID_PREFIX: Array<{ prefix: string; providerId: string }> = [
  { prefix: 'gmail_', providerId: 'google-email' },
  { prefix: 'google_calendar_', providerId: 'google-calendar' },
  { prefix: 'google_drive_', providerId: 'google-drive' },
  { prefix: 'slack_', providerId: 'slack' },
] as const

interface SourceWorkflowInput {
  sourceWorkflowId: string
  nameOverride?: string
}

interface ImportedWorkflowResult {
  workflowId: string
  name: string
  imported: boolean
  deployed: boolean
  credentialPopulation?: CredentialPopulationSummary
  version?: number
  deployedAt?: string
  warnings?: string[]
  error?: string
}

interface CredentialPopulationSummary {
  populatedProviders: string[]
  missingProviders: string[]
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
  inputs?: SourceWorkflowInput[]
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

  const inputs: SourceWorkflowInput[] = []

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
): SourceWorkflowInput | { error: string } {
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

function resolveProviderIdForTool(tool: Record<string, unknown>): string | null {
  const toolType = typeof tool.type === 'string' ? tool.type : ''
  const toolId = typeof tool.toolId === 'string' ? tool.toolId : ''

  if (toolType && PROVIDER_BY_TOOL_TYPE[toolType]) {
    return PROVIDER_BY_TOOL_TYPE[toolType]
  }

  return (
    PROVIDER_BY_TOOL_ID_PREFIX.find(({ prefix }) => toolId.startsWith(prefix))?.providerId ?? null
  )
}

async function getOldestActiveCredentialsByProvider(params: {
  workspaceId: string
  userId: string
}): Promise<Map<string, string>> {
  const rows = await db
    .select({
      id: credential.id,
      providerId: credential.providerId,
    })
    .from(credential)
    .innerJoin(
      credentialMember,
      and(
        eq(credentialMember.credentialId, credential.id),
        eq(credentialMember.userId, params.userId),
        eq(credentialMember.status, 'active')
      )
    )
    .where(and(eq(credential.workspaceId, params.workspaceId), eq(credential.type, 'oauth')))
    .orderBy(asc(credential.createdAt))

  const oldestByProvider = new Map<string, string>()

  for (const row of rows) {
    if (!row.providerId || oldestByProvider.has(row.providerId)) {
      continue
    }
    oldestByProvider.set(row.providerId, row.id)
  }

  return oldestByProvider
}

function populateWorkflowCredentials(
  workflowData: { blocks: Record<string, unknown> },
  credentialsByProvider: Map<string, string>
): CredentialPopulationSummary {
  const populatedProviders = new Set<string>()
  const missingProviders = new Set<string>()

  for (const block of Object.values(workflowData.blocks)) {
    if (!isRecord(block)) {
      continue
    }

    const blockProviderId =
      typeof block.type === 'string' ? PROVIDER_BY_TOOL_TYPE[block.type] : null
    if (blockProviderId && isRecord(block.subBlocks)) {
      const credentialId = credentialsByProvider.get(blockProviderId)
      if (credentialId) {
        populateCredentialSubBlocks(block.subBlocks, credentialId)
        populatedProviders.add(blockProviderId)
        missingProviders.delete(blockProviderId)
      } else {
        missingProviders.add(blockProviderId)
      }
    }

    if (!isRecord(block.subBlocks)) {
      continue
    }

    for (const subBlock of Object.values(block.subBlocks)) {
      if (!isRecord(subBlock) || !Array.isArray(subBlock.value)) {
        continue
      }

      for (const tool of subBlock.value) {
        if (!isRecord(tool)) {
          continue
        }

        const providerId = resolveProviderIdForTool(tool)
        if (!providerId) {
          continue
        }

        const credentialId = credentialsByProvider.get(providerId)
        if (!credentialId) {
          missingProviders.add(providerId)
          continue
        }

        const toolParams = isRecord(tool.params) ? tool.params : {}
        tool.params = toolParams

        toolParams.credentialId = credentialId
        toolParams.oauthCredential = credentialId
        populatedProviders.add(providerId)
        missingProviders.delete(providerId)
      }
    }
  }

  return {
    populatedProviders: Array.from(populatedProviders).sort(),
    missingProviders: Array.from(missingProviders).sort(),
  }
}

function populateCredentialSubBlocks(subBlocks: Record<string, unknown>, credentialId: string) {
  for (const key of ['credential', 'manualCredential', 'triggerCredentials']) {
    const subBlock = subBlocks[key]
    if (isRecord(subBlock)) {
      subBlock.value = credentialId
    }
  }
}

function authenticateCronSecretRequest(request: Request) {
  if (!env.CRON_SECRET) {
    logger.warn('CRON_SECRET environment variable is not set for import-deploy-workflows endpoint')
    return errorResponse('NOT_CONFIGURED', 'Import deploy workflow API is not configured.', 503)
  }

  const providedKey = request.headers.get('x-admin-key')
  if (!providedKey) {
    return errorResponse('UNAUTHORIZED', 'API key required. Provide x-admin-key header.', 401)
  }

  if (!safeCompare(providedKey, env.CRON_SECRET)) {
    logger.warn('Invalid import-deploy-workflows API key attempted', {
      keyPrefix: providedKey.slice(0, 8),
    })
    return errorResponse('UNAUTHORIZED', 'Invalid API key', 401)
  }

  return null
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
  input: SourceWorkflowInput
  workspaceId: string
  userId: string
  credentialsByProvider: Map<string, string>
}): Promise<{
  workflowId: string
  name: string
  credentialPopulation: CredentialPopulationSummary
}> {
  const [sourceWorkflow] = await db
    .select()
    .from(workflow)
    .where(and(eq(workflow.id, params.input.sourceWorkflowId), isNull(workflow.archivedAt)))
    .limit(1)

  if (!sourceWorkflow) {
    throw new Error(`Source workflow not found: ${params.input.sourceWorkflowId}`)
  }

  const normalizedData = await loadWorkflowFromNormalizedTables(params.input.sourceWorkflowId)
  if (!normalizedData) {
    throw new Error(`Source workflow has no normalized data: ${params.input.sourceWorkflowId}`)
  }

  const sourceState = {
    blocks: normalizedData.blocks,
    edges: normalizedData.edges,
    loops: normalizedData.loops,
    parallels: normalizedData.parallels,
    metadata: {
      name: params.input.nameOverride || sourceWorkflow.name,
      description: sourceWorkflow.description ?? undefined,
      color: sourceWorkflow.color,
    },
    variables:
      sourceWorkflow.variables && isRecord(sourceWorkflow.variables)
        ? sourceWorkflow.variables
        : undefined,
  }

  const exportData = sanitizeForExport(sourceState)
  const { data: workflowData, errors } = parseWorkflowJson(JSON.stringify(exportData))

  if (!workflowData || errors.length > 0) {
    throw new Error(`Failed to parse source workflow: ${errors.join(', ')}`)
  }

  const workflowName = params.input.nameOverride || sourceWorkflow.name
  const workflowId = generateId()
  const now = new Date()
  const dedupedName = await deduplicateWorkflowName(workflowName, params.workspaceId, null)
  const credentialPopulation = populateWorkflowCredentials(
    workflowData,
    params.credentialsByProvider
  )

  await db.insert(workflow).values({
    id: workflowId,
    userId: params.userId,
    workspaceId: params.workspaceId,
    folderId: null,
    name: dedupedName,
    description: sourceWorkflow.description || 'Imported via Admin API',
    color: sourceWorkflow.color || DEFAULT_WORKFLOW_COLOR,
    lastSynced: now,
    createdAt: now,
    updatedAt: now,
    isDeployed: false,
    runCount: 0,
    variables: workflowData.variables ?? sourceWorkflow.variables ?? {},
  })

  const saveResult = await saveWorkflowToNormalizedTables(workflowId, workflowData)
  if (!saveResult.success) {
    await db.delete(workflow).where(eq(workflow.id, workflowId))
    throw new Error(`Failed to save workflow state: ${saveResult.error}`)
  }

  return { workflowId, name: dedupedName, credentialPopulation }
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
        const importedWorkflow = await importWorkflow({
          input,
          workspaceId: personalWorkspace.workspaceId,
          userId: targetUser.id,
          credentialsByProvider,
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
            credentialPopulation: importedWorkflow.credentialPopulation,
            error: deployResult.error || 'Failed to deploy workflow',
          })
          continue
        }

        results.push({
          workflowId: importedWorkflow.workflowId,
          name: importedWorkflow.name,
          imported: true,
          deployed: true,
          credentialPopulation: importedWorkflow.credentialPopulation,
          version: deployResult.version,
          deployedAt: deployResult.deployedAt?.toISOString(),
          warnings: deployResult.warnings,
        })
      } catch (error) {
        results.push({
          workflowId: '',
          name: input.nameOverride || input.sourceWorkflowId,
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

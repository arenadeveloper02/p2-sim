import { AuditAction, AuditResourceType, recordAudit } from '@sim/audit'
import { db } from '@sim/db'
import {
  deployedApp,
  generativeAppDraft,
  generativeAppDraftRevision,
  workflow,
} from '@sim/db/schema'
import { createLogger } from '@sim/logger'
import { generateId } from '@sim/utils/id'
import { and, eq, isNull } from 'drizzle-orm'
import { chatDeploymentPasswordSchema } from '@/lib/api/contracts/chats'
import { buildHttpAllowlist } from '@/lib/arena-generative-ui/http-allowlist'
import {
  ARENA_GENERATIVE_APP_BASE_PATH,
  type ArenaGenerativeApiBinding,
  type ArenaGenerativeAppManifest,
  isReservedGenerativeAppIdentifier,
} from '@/lib/arena-generative-ui/types'
import { isDev } from '@/lib/core/config/env-flags'
import { encryptSecret } from '@/lib/core/security/encryption'
import { getBaseUrl } from '@/lib/core/utils/urls'

const logger = createLogger('GenerativeAppDeploy')

export interface GenerativeAppDeployPayload {
  workflowId: string
  userId: string
  workspaceId: string
  draftId: string
  revisionId?: string
  identifier: string
  title: string
  description?: string
  department?: string | null
  authType?: 'public' | 'password' | 'email' | 'sso'
  password?: string | null
  allowedEmails?: string[]
  requireArenaEmailId?: boolean
}

export interface PerformGenerativeAppDeployResult {
  success: boolean
  id?: string
  appUrl?: string
  error?: string
}

function buildAppUrl(identifier: string): string {
  const baseUrl = getBaseUrl()
  try {
    const url = new URL(baseUrl)
    let host = url.host
    if (host.startsWith('www.')) {
      host = host.substring(4)
    }
    return `${url.protocol}//${host}${ARENA_GENERATIVE_APP_BASE_PATH}/${identifier}`
  } catch {
    return `${baseUrl}${ARENA_GENERATIVE_APP_BASE_PATH}/${identifier}`
  }
}

/**
 * Publishes a generative app draft revision to /gui-apps/{identifier}.
 */
export async function performGenerativeAppDeploy(
  params: GenerativeAppDeployPayload
): Promise<PerformGenerativeAppDeployResult> {
  const {
    workflowId,
    userId,
    workspaceId,
    draftId,
    identifier,
    title,
    description = '',
    authType = 'public',
    password,
    allowedEmails = [],
    requireArenaEmailId = true,
  } = params

  if (isReservedGenerativeAppIdentifier(identifier)) {
    return { success: false, error: 'This identifier is reserved' }
  }

  if (password !== undefined) {
    const validatedPassword = chatDeploymentPasswordSchema.safeParse(password)
    if (!validatedPassword.success) {
      return { success: false, error: validatedPassword.error.issues[0].message }
    }
  }

  const [draft] = await db
    .select()
    .from(generativeAppDraft)
    .where(and(eq(generativeAppDraft.id, draftId), eq(generativeAppDraft.workflowId, workflowId)))
    .limit(1)

  if (!draft) {
    return { success: false, error: 'Draft not found' }
  }

  let revisionId = params.revisionId
  let manifest = draft.manifest as ArenaGenerativeAppManifest
  let apiBindings = (
    Array.isArray(draft.apiBindings) ? draft.apiBindings : []
  ) as ArenaGenerativeApiBinding[]
  let entryPath = draft.entryPath

  if (revisionId) {
    const [revision] = await db
      .select()
      .from(generativeAppDraftRevision)
      .where(
        and(
          eq(generativeAppDraftRevision.id, revisionId),
          eq(generativeAppDraftRevision.draftId, draftId)
        )
      )
      .limit(1)
    if (!revision) {
      return { success: false, error: 'Draft revision not found' }
    }
    manifest = revision.manifest as ArenaGenerativeAppManifest
    apiBindings = (
      Array.isArray(revision.apiBindings) ? revision.apiBindings : []
    ) as ArenaGenerativeApiBinding[]
    entryPath = revision.entryPath
  } else {
    const [latest] = await db
      .select({ id: generativeAppDraftRevision.id })
      .from(generativeAppDraftRevision)
      .where(
        and(
          eq(generativeAppDraftRevision.draftId, draftId),
          eq(generativeAppDraftRevision.revision, draft.revision)
        )
      )
      .limit(1)
    revisionId = latest?.id
  }

  for (const binding of apiBindings) {
    if (binding.kind !== 'workflow' || !binding.workflowId) continue
    const [bound] = await db
      .select({ isDeployed: workflow.isDeployed })
      .from(workflow)
      .where(eq(workflow.id, binding.workflowId))
      .limit(1)
    if (!bound?.isDeployed) {
      return {
        success: false,
        error: `Workflow binding "${binding.key}" is not deployed`,
      }
    }
  }

  const allowlist = buildHttpAllowlist(apiBindings, { allowHttp: isDev })
  if (!allowlist.ok) {
    return { success: false, error: allowlist.error }
  }

  let encryptedPassword: string | null = null
  if (authType === 'password' && password) {
    const { encrypted } = await encryptSecret(password)
    encryptedPassword = encrypted
  }

  const [existingByWorkflow] = await db
    .select()
    .from(deployedApp)
    .where(and(eq(deployedApp.workflowId, workflowId), isNull(deployedApp.archivedAt)))
    .limit(1)

  const [existingByIdentifier] = await db
    .select({ id: deployedApp.id, workflowId: deployedApp.workflowId })
    .from(deployedApp)
    .where(and(eq(deployedApp.identifier, identifier), isNull(deployedApp.archivedAt)))
    .limit(1)

  if (existingByIdentifier && existingByIdentifier.workflowId !== workflowId) {
    return { success: false, error: 'Identifier already in use' }
  }

  if (authType === 'password' && !encryptedPassword && !existingByWorkflow?.password) {
    return { success: false, error: 'Password is required when using password protection' }
  }

  const now = new Date()
  const departmentValue = params.department?.trim() ? params.department.trim() : null
  const allowed = authType === 'email' || authType === 'sso' ? allowedEmails : []

  let id: string
  let isUpdate = false
  if (existingByWorkflow) {
    isUpdate = true
    id = existingByWorkflow.id
    let passwordToStore: string | null
    if (authType === 'password') {
      passwordToStore = encryptedPassword || existingByWorkflow.password
    } else {
      passwordToStore = null
    }

    await db
      .update(deployedApp)
      .set({
        identifier,
        title,
        description: description || null,
        department: departmentValue,
        authType,
        password: passwordToStore,
        allowedEmails: allowed,
        requireArenaEmailId,
        draftId,
        revisionId: revisionId ?? null,
        manifest,
        apiBindings,
        httpAllowlist: allowlist.hosts,
        isActive: true,
        updatedAt: now,
      })
      .where(eq(deployedApp.id, id))
  } else {
    id = generateId()
    await db.insert(deployedApp).values({
      id,
      workspaceId,
      workflowId,
      userId,
      identifier,
      title,
      description: description || null,
      department: departmentValue,
      isActive: true,
      authType,
      password: encryptedPassword,
      allowedEmails: allowed,
      requireArenaEmailId,
      draftId,
      revisionId: revisionId ?? null,
      manifest,
      apiBindings,
      httpAllowlist: allowlist.hosts,
      createdAt: now,
      updatedAt: now,
    })
  }

  const appUrl = buildAppUrl(identifier)
  logger.info(`Generative app "${title}" deployed at ${appUrl}`, { id, entryPath, isUpdate })

  recordAudit({
    workspaceId,
    actorId: userId,
    action: isUpdate ? AuditAction.GENERATIVE_APP_UPDATED : AuditAction.GENERATIVE_APP_DEPLOYED,
    resourceType: AuditResourceType.GENERATIVE_APP,
    resourceId: id,
    resourceName: title,
    description: `${isUpdate ? 'Updated' : 'Deployed'} generative app "${title}"`,
    metadata: {
      workflowId,
      identifier,
      authType,
      appUrl,
      draftId,
      revisionId,
    },
  })

  return { success: true, id, appUrl }
}

/**
 * Archives a published generative app so its identifier can be reused.
 */
export async function performGenerativeAppUndeploy(options: {
  id: string
  userId: string
  workspaceId: string | null
  title: string
}): Promise<void> {
  await db
    .update(deployedApp)
    .set({
      isActive: false,
      archivedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(deployedApp.id, options.id))

  recordAudit({
    workspaceId: options.workspaceId,
    actorId: options.userId,
    action: AuditAction.GENERATIVE_APP_DELETED,
    resourceType: AuditResourceType.GENERATIVE_APP,
    resourceId: options.id,
    resourceName: options.title,
    description: `Archived generative app "${options.title}"`,
  })
}

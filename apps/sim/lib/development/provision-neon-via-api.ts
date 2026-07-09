import { createLogger } from '@sim/logger'
import { sleep } from '@sim/utils/helpers'
import { toError } from '@sim/utils/errors'
import type { ProvisionNeonDatabaseResult } from '@/lib/development/provision-vercel-neon-database'
import { upsertVercelProjectDatabaseUrl } from '@/lib/development/vercel-project-env'

const logger = createLogger('ProvisionNeonViaApi')

const NEON_API = 'https://console.neon.tech/api/v2'
const CONNECTION_POLL_INTERVAL_MS = 2_000
const CONNECTION_POLL_TIMEOUT_MS = 120_000

export interface ProvisionNeonViaApiInput {
  neonApiKey: string
  neonOrgId?: string
  vercelToken: string
  vercelProjectId: string
  storeName: string
  vercelTeamId?: string
}

interface NeonConnectionUri {
  connection_uri?: string
  connection_parameters?: {
    database?: string
    role?: string
  }
}

interface NeonCreateProjectResponse {
  project?: { id?: string; name?: string }
  connection_uris?: NeonConnectionUri[]
}

interface NeonConnectionUriResponse {
  uri?: string
  connection_uri?: string
}

interface NeonOrganization {
  id?: string
  name?: string
}

interface NeonOrganizationsResponse {
  organizations?: NeonOrganization[]
}

async function neonRequest<T>(
  apiKey: string,
  path: string,
  init?: RequestInit
): Promise<{ data: T; status: number }> {
  const response = await fetch(`${NEON_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const text = await response.text()
  let data: T
  try {
    data = text ? (JSON.parse(text) as T) : ({} as T)
  } catch {
    throw new Error(`Neon API returned invalid JSON (${response.status})`)
  }

  return { data, status: response.status }
}

function neonErrorMessage(data: unknown, status: number): string {
  if (typeof data === 'object' && data) {
    if ('message' in data && typeof (data as { message?: unknown }).message === 'string') {
      return (data as { message: string }).message
    }
    if ('error' in data && typeof (data as { error?: unknown }).error === 'string') {
      return (data as { error: string }).error
    }
  }
  return `Neon API error (${status})`
}

function isOrgIdRequiredMessage(message: string): boolean {
  return /org_id is required/i.test(message)
}

/**
 * Neon orgs created through Vercel cannot be provisioned via the Neon API.
 */
export function isVercelManagedNeonError(message?: string): boolean {
  return Boolean(message && /managed by vercel/i.test(message))
}

function parseOrganizationsFromResponse(data: unknown): NeonOrganization[] {
  if (Array.isArray(data)) {
    return data.filter((org): org is NeonOrganization => typeof org === 'object' && org !== null)
  }

  if (typeof data === 'object' && data && 'organizations' in data) {
    const organizations = (data as NeonOrganizationsResponse).organizations
    return organizations ?? []
  }

  return []
}

function extractConnectionUriFromCreateResponse(
  response: NeonCreateProjectResponse
): string | undefined {
  const pooled =
    response.connection_uris?.find((entry) => entry.connection_uri?.includes('-pooler')) ??
    response.connection_uris?.[0]

  return pooled?.connection_uri?.trim()
}

function missingNeonOrgIdError(): string {
  return 'Neon org_id is required for this API key. Add DEVELOPMENT_NEON_ORG_ID=org-... to apps/sim/.env (Neon Console → Organization Settings → General), then restart dev:full.'
}

/**
 * Organization-scoped API keys can create projects without an explicit org_id.
 */
async function usesOrganizationScopedApiKey(apiKey: string): Promise<boolean> {
  const { status } = await neonRequest<unknown>(apiKey, '/projects?limit=1', { method: 'GET' })
  return status === 200
}

/**
 * Resolves the Neon org_id for project creation. Personal API keys require org_id.
 */
async function resolveNeonOrgId(apiKey: string, orgIdHint?: string): Promise<string | undefined> {
  const configured = orgIdHint?.trim()
  if (configured) {
    logger.info('Using Neon org_id from DEVELOPMENT_NEON_ORG_ID', { orgId: configured })
    return configured
  }

  const { data, status } = await neonRequest<NeonOrganizationsResponse | NeonOrganization[]>(
    apiKey,
    '/users/me/organizations',
    { method: 'GET' }
  )

  if (status !== 200) {
    logger.warn('Neon organizations lookup failed', { status })
    return undefined
  }

  const organizations = parseOrganizationsFromResponse(data).filter((org) => org.id?.trim())
  if (organizations.length === 0) {
    logger.warn('Neon organizations lookup returned no organizations')
    return undefined
  }

  const orgId = organizations[0]?.id?.trim()
  if (!orgId) {
    return undefined
  }

  if (organizations.length > 1) {
    logger.warn('Multiple Neon organizations found; using the first. Set DEVELOPMENT_NEON_ORG_ID to override.', {
      orgId,
      orgName: organizations[0]?.name,
      orgCount: organizations.length,
    })
  } else {
    logger.info('Resolved Neon org_id from API key', { orgId, orgName: organizations[0]?.name })
  }

  return orgId
}

async function createNeonProject(
  apiKey: string,
  projectName: string,
  orgId?: string
): Promise<{ projectId: string; connectionUri?: string }> {
  const resolvedOrgId = await resolveNeonOrgId(apiKey, orgId)
  const orgScopedKey = resolvedOrgId ? false : await usesOrganizationScopedApiKey(apiKey)

  if (!resolvedOrgId && !orgScopedKey) {
    throw new Error(missingNeonOrgIdError())
  }

  const body: Record<string, unknown> = {
    project: {
      name: projectName.slice(0, 128),
      pg_version: 16,
    },
  }

  if (resolvedOrgId) {
    body.org_id = resolvedOrgId
  } else {
    logger.info('Creating Neon project with organization-scoped API key')
  }

  const { data, status } = await neonRequest<NeonCreateProjectResponse>(
    apiKey,
    '/projects',
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  )

  if (status !== 200 && status !== 201) {
    const message = neonErrorMessage(data, status)
    if (isVercelManagedNeonError(message)) {
      throw new Error(message)
    }
    if (isOrgIdRequiredMessage(message)) {
      throw new Error(missingNeonOrgIdError())
    }
    throw new Error(message)
  }

  const projectId = data.project?.id?.trim()
  if (!projectId) {
    throw new Error('Neon did not return a project id after creation')
  }

  return {
    projectId,
    connectionUri: extractConnectionUriFromCreateResponse(data),
  }
}

/**
 * Fetches the pooled connection URI for an existing Neon project.
 */
export async function resolveNeonConnectionUri(apiKey: string, projectId: string): Promise<string> {
  const deadline = Date.now() + CONNECTION_POLL_TIMEOUT_MS
  const query =
    'database_name=neondb&role_name=neondb_owner&pooled=true'

  while (Date.now() < deadline) {
    const { data, status } = await neonRequest<NeonConnectionUriResponse>(
      apiKey,
      `/projects/${encodeURIComponent(projectId)}/connection_uri?${query}`,
      { method: 'GET' }
    )

    if (status === 200) {
      const uri = data.uri?.trim() || data.connection_uri?.trim()
      if (uri) {
        return uri
      }
    }

    await sleep(CONNECTION_POLL_INTERVAL_MS)
  }

  throw new Error('Timed out waiting for Neon connection URI after project creation')
}

/**
 * Creates a Neon Postgres project via the Neon API and sets DATABASE_URL on the Vercel project.
 * Does not require the Vercel Neon marketplace integration to be installed.
 */
export async function provisionNeonDatabaseViaApi(
  input: ProvisionNeonViaApiInput
): Promise<ProvisionNeonDatabaseResult> {
  const apiKey = input.neonApiKey?.trim()
  const vercelToken = input.vercelToken?.trim()
  const vercelProjectId = input.vercelProjectId?.trim()
  const storeName = input.storeName.trim()

  if (!apiKey || !vercelToken || !vercelProjectId || !storeName) {
    return {
      success: false,
      error: 'Neon API key, Vercel token, project id, and store name are required',
    }
  }

  try {
    logger.info('Creating Neon Postgres project via Neon API', {
      storeName,
      hasConfiguredOrgId: Boolean(input.neonOrgId?.trim()),
    })

    const created = await createNeonProject(apiKey, storeName, input.neonOrgId)
    const connectionUri =
      created.connectionUri ?? (await resolveNeonConnectionUri(apiKey, created.projectId))

    await upsertVercelProjectDatabaseUrl({
      vercelToken,
      vercelProjectId,
      databaseUrl: connectionUri,
      vercelTeamId: input.vercelTeamId,
    })

    logger.info('Neon Postgres provisioned via API and DATABASE_URL set on Vercel project', {
      vercelProjectId,
      neonProjectId: created.projectId,
    })

    return {
      success: true,
      storeResourceId: created.projectId,
      neonProjectId: created.projectId,
      databaseUrl: connectionUri,
    }
  } catch (error) {
    const message = toError(error).message
    logger.error('Neon API database provisioning failed', { error: message })
    return { success: false, error: message }
  }
}

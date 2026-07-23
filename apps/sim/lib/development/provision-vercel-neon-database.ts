import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { sleep } from '@sim/utils/helpers'
import {
  isVercelManagedNeonError,
  provisionNeonDatabaseViaApi,
} from '@/lib/development/provision-neon-via-api'
import { waitForProjectDatabaseUrl } from '@/lib/development/vercel-project-env'

const logger = createLogger('ProvisionVercelNeonDatabase')

const VERCEL_API = 'https://api.vercel.com'
const NEON_INTEGRATION_SLUG = 'neon'
const STORE_POLL_INTERVAL_MS = 3_000
const STORE_POLL_TIMEOUT_MS = 120_000
const READY_STORE_STATUSES = new Set(['available', 'ready'])
const USABLE_NEON_CONFIGURATION_STATUSES = new Set(['ready', 'resumed'])

export interface ProvisionNeonDatabaseInput {
  vercelToken: string
  vercelProjectId: string
  storeName: string
  vercelTeamId?: string
  integrationConfigurationId?: string
  neonApiKey?: string
  neonOrgId?: string
}

export interface ProvisionNeonDatabaseResult {
  success: boolean
  storeResourceId?: string
  neonProjectId?: string
  /** Pooled Postgres connection string when provisioned via Neon API. */
  databaseUrl?: string
  error?: string
}

interface VercelIntegrationRef {
  slug?: string
  name?: string
}

interface VercelIntegrationConfiguration {
  id?: string
  status?: string
  installationType?: string
  integration?: VercelIntegrationRef
  integrationId?: string
}

interface VercelIntegrationProduct {
  id?: string
  slug?: string
  name?: string
  primaryProtocol?: string
}

interface VercelIntegrationStore {
  id?: string
  externalResourceId?: string
  status?: string | null
}

interface VercelCreateStoreResponse {
  store?: VercelIntegrationStore | null
}

async function vercelRequest<T>(
  token: string,
  path: string,
  init?: RequestInit,
  teamId?: string
): Promise<{ data: T; status: number }> {
  let url = `${VERCEL_API}${path}`
  if (teamId?.trim() && !path.includes('teamId=')) {
    url += `${path.includes('?') ? '&' : '?'}teamId=${encodeURIComponent(teamId.trim())}`
  }

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const text = await response.text()
  let data: T
  try {
    data = text ? (JSON.parse(text) as T) : ({} as T)
  } catch {
    throw new Error(`Vercel API returned invalid JSON (${response.status})`)
  }

  return { data, status: response.status }
}

function vercelErrorMessage(data: unknown, status: number): string {
  if (typeof data === 'object' && data && 'error' in data) {
    const err = (data as { error?: { message?: string } }).error
    if (err?.message) {
      return err.message
    }
  }
  if (typeof data === 'object' && data && 'message' in data) {
    const message = (data as { message?: string }).message
    if (message) {
      return message
    }
  }
  return `Vercel API error (${status})`
}

function resolveStoreResourceId(store: VercelIntegrationStore): string | undefined {
  return store.id?.trim() || store.externalResourceId?.trim()
}

function isStoreReady(status?: string | null): boolean {
  return Boolean(status && READY_STORE_STATUSES.has(status))
}

function parseIntegrationConfigurations(
  data: { configurations?: VercelIntegrationConfiguration[] } | VercelIntegrationConfiguration[]
): VercelIntegrationConfiguration[] {
  return Array.isArray(data) ? data : (data.configurations ?? [])
}

function isUsableNeonConfiguration(configuration: VercelIntegrationConfiguration): boolean {
  if (!configuration.id?.trim()) {
    return false
  }

  const status = configuration.status?.trim()
  if (!status || !USABLE_NEON_CONFIGURATION_STATUSES.has(status)) {
    return false
  }

  const slug = configuration.integration?.slug?.trim()
  return (
    slug === NEON_INTEGRATION_SLUG ||
    configuration.installationType === 'marketplace' ||
    Boolean(slug?.includes('neon'))
  )
}

function neonDiscoveryQuery(): string {
  const searchParams = new URLSearchParams({
    view: 'account',
    installationType: 'marketplace',
    integrationIdOrSlug: NEON_INTEGRATION_SLUG,
  })
  return searchParams.toString()
}

/**
 * Lists Neon marketplace integration configurations (v2 API, matching Vercel CLI).
 */
async function listNeonIntegrationConfigurations(
  token: string,
  teamId?: string
): Promise<VercelIntegrationConfiguration[]> {
  const query = neonDiscoveryQuery()
  const paths = [
    `/v2/integrations/configurations?${query}`,
    `/v1/integrations/configurations?${query}`,
  ]

  for (const path of paths) {
    const { data, status } = await vercelRequest<
      { configurations?: VercelIntegrationConfiguration[] } | VercelIntegrationConfiguration[]
    >(token, path, { method: 'GET' }, teamId)

    if (status !== 200) {
      continue
    }

    const configurations = parseIntegrationConfigurations(data)
    if (configurations.length > 0) {
      return configurations
    }
  }

  return []
}

function neonNotInstalledError(teamId?: string): string {
  const installSteps =
    'Install Neon once from https://vercel.com/marketplace/neon (free plan) or run `vercel install neon`.'

  if (teamId?.trim()) {
    return `Neon is not installed on Vercel team ${teamId.trim()}. ${installSteps} If Neon is installed on a different team or personal account, set DEVELOPMENT_VERCEL_TEAM_ID correctly or set DEVELOPMENT_VERCEL_NEON_INTEGRATION_CONFIG_ID=icfg_... in .env.`
  }

  return `Neon is not installed on your Vercel account. ${installSteps} Or set DEVELOPMENT_NEON_API_KEY in .env to create databases automatically without the Vercel Neon integration. You can also set DEVELOPMENT_VERCEL_TEAM_ID or DEVELOPMENT_VERCEL_NEON_INTEGRATION_CONFIG_ID=icfg_...`
}

function isNeonMarketplaceUnavailableError(message: string): boolean {
  return (
    message.includes('Neon is not installed') ||
    message.includes('Invalid DEVELOPMENT_VERCEL_NEON_INTEGRATION_CONFIG_ID')
  )
}

function vercelManagedNeonFallbackError(marketplaceError?: string): string {
  const installHint =
    'Install Neon on your Vercel team from https://vercel.com/marketplace/neon (one-time), then retry. Vercel-managed Neon orgs cannot use DEVELOPMENT_NEON_API_KEY — remove it from .env or use a personal Neon org API key instead.'

  if (marketplaceError?.trim()) {
    return `${marketplaceError} ${installHint}`
  }

  return installHint
}

/**
 * Resolves the installed Neon marketplace integration configuration on Vercel.
 */
async function resolveNeonIntegrationConfigurationId(
  token: string,
  teamId?: string,
  overrideConfigId?: string
): Promise<string> {
  const configured = overrideConfigId?.trim()
  if (configured) {
    const { data, status } = await vercelRequest<VercelIntegrationConfiguration>(
      token,
      `/v1/integrations/configuration/${encodeURIComponent(configured)}`,
      { method: 'GET' },
      teamId
    )

    if (status !== 200) {
      throw new Error(
        `Invalid DEVELOPMENT_VERCEL_NEON_INTEGRATION_CONFIG_ID (${configured}): ${vercelErrorMessage(data, status)}. Install Neon on Vercel or fix the team id in DEVELOPMENT_VERCEL_TEAM_ID.`
      )
    }

    return configured
  }

  const teamCandidates = teamId?.trim() ? [teamId.trim(), undefined] : [undefined]

  for (const candidateTeamId of teamCandidates) {
    const configurations = await listNeonIntegrationConfigurations(token, candidateTeamId)
    const ready = configurations.find(isUsableNeonConfiguration)

    if (ready?.id) {
      logger.info('Resolved Neon integration configuration', {
        integrationConfigurationId: ready.id,
        teamId: candidateTeamId,
        status: ready.status,
      })
      return ready.id
    }
  }

  throw new Error(neonNotInstalledError(teamId))
}

/**
 * Picks the Neon Postgres product from an installed integration configuration.
 */
async function resolveNeonProductSlugOrId(
  token: string,
  integrationConfigurationId: string,
  teamId?: string
): Promise<string> {
  const { data, status } = await vercelRequest<{ products?: VercelIntegrationProduct[] }>(
    token,
    `/v1/integrations/configuration/${encodeURIComponent(integrationConfigurationId)}/products`,
    { method: 'GET' },
    teamId
  )

  if (status !== 200) {
    throw new Error(vercelErrorMessage(data, status))
  }

  const products = data.products ?? []
  const postgresProduct =
    products.find((product) => product.slug?.includes('postgres')) ??
    products.find((product) => product.name?.toLowerCase().includes('postgres')) ??
    products.find((product) => product.primaryProtocol === 'storage') ??
    products[0]

  const productRef = postgresProduct?.slug ?? postgresProduct?.id
  if (!productRef) {
    throw new Error('No Neon Postgres product found for the installed Vercel Neon integration')
  }

  return productRef
}

async function waitForIntegrationStoreReady(
  token: string,
  integrationConfigurationId: string,
  resourceId: string,
  teamId?: string
): Promise<VercelIntegrationStore> {
  const deadline = Date.now() + STORE_POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    const { data, status } = await vercelRequest<{ resources?: VercelIntegrationStore[] }>(
      token,
      `/v1/installations/${encodeURIComponent(integrationConfigurationId)}/resources`,
      { method: 'GET' },
      teamId
    )

    if (status === 200) {
      const resource = (data.resources ?? []).find(
        (entry) => resolveStoreResourceId(entry) === resourceId
      )
      if (resource && isStoreReady(resource.status)) {
        return resource
      }
    }

    await sleep(STORE_POLL_INTERVAL_MS)
  }

  throw new Error('Timed out waiting for the Vercel Neon database store to become ready')
}

async function connectStoreToProject(
  token: string,
  integrationConfigurationId: string,
  resourceId: string,
  productSlugOrId: string,
  vercelProjectId: string,
  teamId?: string
): Promise<{ ok: boolean; error?: string }> {
  const connectPaths = [
    `/v1/integrations/installations/${encodeURIComponent(integrationConfigurationId)}/resources/${encodeURIComponent(resourceId)}/connections`,
    `/v1/integrations/installations/${encodeURIComponent(integrationConfigurationId)}/products/${encodeURIComponent(productSlugOrId)}/resources/${encodeURIComponent(resourceId)}/connections`,
  ]

  const body = JSON.stringify({
    projectId: vercelProjectId,
    envVarEnvironments: ['production', 'preview', 'development'],
    makeEnvVarsSensitive: true,
  })

  let lastError: string | undefined

  for (const path of connectPaths) {
    const { data, status } = await vercelRequest<unknown>(
      token,
      path,
      { method: 'POST', body },
      teamId
    )

    if (status === 200 || status === 201) {
      return { ok: true }
    }

    lastError = vercelErrorMessage(data, status)
  }

  return { ok: false, error: lastError ?? 'Failed to connect Neon store to Vercel project' }
}

/**
 * Provisions Neon Postgres through the Vercel marketplace integration and connects it to a project.
 */
async function provisionNeonDatabaseViaVercelMarketplace(
  input: ProvisionNeonDatabaseInput
): Promise<ProvisionNeonDatabaseResult> {
  const token = input.vercelToken?.trim()
  const vercelProjectId = input.vercelProjectId?.trim()
  const storeName = input.storeName.trim()

  try {
    const integrationConfigurationId = await resolveNeonIntegrationConfigurationId(
      token,
      input.vercelTeamId,
      input.integrationConfigurationId
    )

    const productSlugOrId = await resolveNeonProductSlugOrId(
      token,
      integrationConfigurationId,
      input.vercelTeamId
    )

    logger.info('Creating Neon Postgres store via Vercel integration', {
      storeName,
      integrationConfigurationId,
      productSlugOrId,
    })

    const { data: created, status: createStatus } = await vercelRequest<VercelCreateStoreResponse>(
      token,
      '/v1/storage/stores/integration/direct',
      {
        method: 'POST',
        body: JSON.stringify({
          name: storeName.slice(0, 128),
          integrationConfigurationId,
          integrationProductIdOrSlug: productSlugOrId,
          source: 'marketplace',
        }),
      },
      input.vercelTeamId
    )

    if (createStatus !== 200 && createStatus !== 201) {
      return { success: false, error: vercelErrorMessage(created, createStatus) }
    }

    const createdStore = created.store
    if (!createdStore) {
      return { success: false, error: 'Vercel did not return a Neon store after creation' }
    }

    const resourceId = resolveStoreResourceId(createdStore)
    if (!resourceId) {
      return {
        success: false,
        error: 'Vercel Neon store was created but no resource id was returned',
      }
    }

    const readyStore = isStoreReady(createdStore.status)
      ? createdStore
      : await waitForIntegrationStoreReady(
          token,
          integrationConfigurationId,
          resourceId,
          input.vercelTeamId
        )

    const connectResult = await connectStoreToProject(
      token,
      integrationConfigurationId,
      resourceId,
      productSlugOrId,
      vercelProjectId,
      input.vercelTeamId
    )

    if (!connectResult.ok) {
      return {
        success: false,
        storeResourceId: resourceId,
        neonProjectId: readyStore.externalResourceId,
        error: connectResult.error,
      }
    }

    const hasDatabaseUrl = await waitForProjectDatabaseUrl(
      token,
      vercelProjectId,
      input.vercelTeamId
    )
    if (!hasDatabaseUrl) {
      return {
        success: false,
        storeResourceId: resourceId,
        neonProjectId: readyStore.externalResourceId,
        error:
          'Neon store was connected but DATABASE_URL was not set on the Vercel project in time. Check Storage → Neon → Connect Project for this app, then redeploy.',
      }
    }

    logger.info('Neon Postgres connected to Vercel project with DATABASE_URL', {
      vercelProjectId,
      resourceId,
      neonProjectId: readyStore.externalResourceId,
    })

    return {
      success: true,
      storeResourceId: resourceId,
      neonProjectId: readyStore.externalResourceId,
    }
  } catch (error) {
    const message = toError(error).message
    logger.error('Vercel Neon database provisioning failed', { error: message })
    return { success: false, error: message }
  }
}

/**
 * Provisions Neon Postgres for a generated app.
 * Uses DEVELOPMENT_NEON_API_KEY when set (no Vercel Neon install required).
 * Otherwise uses the Vercel marketplace Neon integration.
 */
export async function provisionNeonDatabase(
  input: ProvisionNeonDatabaseInput
): Promise<ProvisionNeonDatabaseResult> {
  const token = input.vercelToken?.trim()
  const vercelProjectId = input.vercelProjectId?.trim()
  const storeName = input.storeName.trim()
  const neonApiKey = input.neonApiKey?.trim()

  if (!token || !vercelProjectId || !storeName) {
    return {
      success: false,
      error: 'Vercel token, project id, and store name are required to provision Neon Postgres',
    }
  }

  if (neonApiKey) {
    logger.info('Provisioning Neon via API key (per-project database)')
    const apiResult = await provisionNeonDatabaseViaApi({
      neonApiKey,
      neonOrgId: input.neonOrgId,
      vercelToken: token,
      vercelProjectId,
      storeName,
      vercelTeamId: input.vercelTeamId,
    })

    if (apiResult.success) {
      return apiResult
    }

    if (isVercelManagedNeonError(apiResult.error)) {
      logger.info(
        'Neon organization is Vercel-managed; falling back to Vercel marketplace provisioning'
      )
      const marketplaceResult = await provisionNeonDatabaseViaVercelMarketplace(input)
      if (marketplaceResult.success) {
        return marketplaceResult
      }
      return {
        success: false,
        error: vercelManagedNeonFallbackError(marketplaceResult.error),
      }
    }

    return apiResult
  }

  const marketplaceResult = await provisionNeonDatabaseViaVercelMarketplace(input)
  if (marketplaceResult.success) {
    return marketplaceResult
  }

  const marketplaceError = marketplaceResult.error ?? ''
  if (isNeonMarketplaceUnavailableError(marketplaceError)) {
    return {
      success: false,
      error: `${marketplaceError} For fully automatic per-project databases, add DEVELOPMENT_NEON_API_KEY from https://console.neon.tech/app/settings/api-keys`,
    }
  }

  return marketplaceResult
}

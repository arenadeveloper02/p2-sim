import { sleep } from '@sim/utils/helpers'

const VERCEL_API = 'https://api.vercel.com'
const ENV_POLL_INTERVAL_MS = 2_000
const ENV_POLL_TIMEOUT_MS = 90_000

interface VercelProjectEnvVar {
  key?: string
  target?: string | string[]
}

export interface UpsertVercelProjectDatabaseUrlInput {
  vercelToken: string
  vercelProjectId: string
  databaseUrl: string
  vercelTeamId?: string
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

function envVarTargets(target?: string | string[]): string[] {
  if (!target) {
    return []
  }
  return Array.isArray(target) ? target : [target]
}

function hasDatabaseUrlForProduction(envs: VercelProjectEnvVar[]): boolean {
  return envs.some((entry) => {
    if (entry.key?.trim() !== 'DATABASE_URL') {
      return false
    }
    const targets = envVarTargets(entry.target)
    return targets.length === 0 || targets.includes('production')
  })
}

async function listProjectEnvVars(
  token: string,
  projectId: string,
  teamId?: string
): Promise<VercelProjectEnvVar[]> {
  const { data, status } = await vercelRequest<{ envs?: VercelProjectEnvVar[] }>(
    token,
    `/v10/projects/${encodeURIComponent(projectId)}/env?target=production`,
    { method: 'GET' },
    teamId
  )

  if (status !== 200) {
    return []
  }

  return data.envs ?? []
}

/**
 * Upserts DATABASE_URL on a Vercel project for production, preview, and development.
 */
export async function upsertVercelProjectDatabaseUrl(
  input: UpsertVercelProjectDatabaseUrlInput
): Promise<void> {
  const token = input.vercelToken.trim()
  const projectId = input.vercelProjectId.trim()
  const databaseUrl = input.databaseUrl.trim()

  const { data, status } = await vercelRequest<unknown>(
    token,
    `/v10/projects/${encodeURIComponent(projectId)}/env?upsert=true`,
    {
      method: 'POST',
      body: JSON.stringify({
        key: 'DATABASE_URL',
        value: databaseUrl,
        type: 'encrypted',
        target: ['production', 'preview', 'development'],
      }),
    },
    input.vercelTeamId
  )

  if (status !== 200 && status !== 201) {
    throw new Error(vercelErrorMessage(data, status))
  }
}

/**
 * Returns whether the Vercel project already has DATABASE_URL for production.
 */
export async function projectHasDatabaseUrl(
  token: string,
  projectId: string,
  teamId?: string
): Promise<boolean> {
  const envs = await listProjectEnvVars(token, projectId, teamId)
  return hasDatabaseUrlForProduction(envs)
}

/**
 * Waits until Vercel exposes DATABASE_URL on the project production target.
 */
export async function waitForProjectDatabaseUrl(
  token: string,
  projectId: string,
  teamId?: string
): Promise<boolean> {
  const deadline = Date.now() + ENV_POLL_TIMEOUT_MS

  while (Date.now() < deadline) {
    const envs = await listProjectEnvVars(token, projectId, teamId)
    if (hasDatabaseUrlForProduction(envs)) {
      return true
    }
    await sleep(ENV_POLL_INTERVAL_MS)
  }

  return false
}

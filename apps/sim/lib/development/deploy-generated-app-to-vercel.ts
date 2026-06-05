import { createLogger } from '@sim/logger'
import { sleep } from '@sim/utils/helpers'
import { toError } from '@sim/utils/errors'

const logger = createLogger('DeployGeneratedAppToVercel')

const VERCEL_API = 'https://api.vercel.com'
const DEPLOY_POLL_INTERVAL_MS = 5_000
const DEPLOY_TIMEOUT_MS = 600_000
const DEFAULT_GIT_REF = 'main'

export interface DeployGeneratedAppToVercelInput {
  vercelToken: string
  projectName: string
  githubOwner: string
  githubRepoName: string
  vercelTeamId?: string
  gitRef?: string
}

export interface DeployGeneratedAppToVercelResult {
  success: boolean
  vercelUrl?: string
  vercelDeploymentUrl?: string
  vercelProjectId?: string
  vercelDeploymentId?: string
  vercelInspectorUrl?: string
  error?: string
}

interface VercelProjectLink {
  type?: string
  repo?: string
  repoId?: number
}

interface VercelProject {
  id: string
  name: string
  link?: VercelProjectLink | null
}

interface VercelDeployment {
  id: string
  url?: string
  readyState?: string
  alias?: string[]
  inspectorUrl?: string
  errorMessage?: string
  errorCode?: string
}

interface VercelDeploymentEvent {
  type?: string
  level?: string
  text?: string
  payload?: { text?: string; message?: string }
}

const MAX_BUILD_LOG_CHARS = 8_000

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

async function getVercelProjectByName(
  token: string,
  projectName: string,
  teamId?: string
): Promise<VercelProject | null> {
  const { data, status } = await vercelRequest<VercelProject>(
    token,
    `/v9/projects/${encodeURIComponent(projectName)}`,
    { method: 'GET' },
    teamId
  )
  if (status === 200) {
    return data
  }
  if (status === 404) {
    return null
  }
  throw new Error(vercelErrorMessage(data, status))
}

async function createVercelProject(
  token: string,
  projectName: string,
  githubRepo: string,
  teamId?: string
): Promise<VercelProject> {
  const body = JSON.stringify({
    name: projectName,
    framework: 'nextjs',
    gitRepository: {
      type: 'github',
      repo: githubRepo,
    },
  })

  const { data, status } = await vercelRequest<VercelProject>(
    token,
    '/v11/projects',
    { method: 'POST', body },
    teamId
  )

  if (status === 200 || status === 201) {
    return data
  }

  if (status === 409) {
    const existing = await getVercelProjectByName(token, projectName, teamId)
    if (existing) {
      return existing
    }
  }

  throw new Error(vercelErrorMessage(data, status))
}

function buildGitSource(
  gitRef: string,
  githubOwner: string,
  githubRepoName: string,
  repoId?: number
): Record<string, string | number> {
  if (repoId) {
    return { type: 'github', repoId, ref: gitRef }
  }
  return {
    type: 'github',
    org: githubOwner,
    repo: githubRepoName,
    ref: gitRef,
  }
}

async function createGitDeployment(
  token: string,
  project: VercelProject,
  gitRef: string,
  githubOwner: string,
  githubRepoName: string,
  teamId?: string
): Promise<VercelDeployment> {
  const body = JSON.stringify({
    name: project.name,
    project: project.id,
    target: 'production',
    gitSource: buildGitSource(gitRef, githubOwner, githubRepoName, project.link?.repoId),
    projectSettings: {
      framework: 'nextjs',
    },
  })

  const { data, status } = await vercelRequest<VercelDeployment>(
    token,
    '/v13/deployments',
    { method: 'POST', body },
    teamId
  )

  if (status !== 200 && status !== 201) {
    throw new Error(vercelErrorMessage(data, status))
  }

  return data
}

async function getVercelDeployment(
  token: string,
  deploymentId: string,
  teamId?: string
): Promise<VercelDeployment> {
  const { data, status } = await vercelRequest<VercelDeployment>(
    token,
    `/v13/deployments/${encodeURIComponent(deploymentId)}`,
    { method: 'GET' },
    teamId
  )

  if (status !== 200) {
    throw new Error(vercelErrorMessage(data, status))
  }

  return data
}

function toHttpsUrl(url: string): string {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  return `https://${url}`
}

async function fetchDeploymentBuildLog(
  token: string,
  deploymentId: string,
  teamId?: string
): Promise<string> {
  const { data, status } = await vercelRequest<VercelDeploymentEvent[] | { events?: VercelDeploymentEvent[] }>(
    token,
    `/v3/deployments/${encodeURIComponent(deploymentId)}/events?direction=backward&limit=-1`,
    { method: 'GET' },
    teamId
  )

  if (status !== 200) {
    return ''
  }

  const events = Array.isArray(data) ? data : (data.events ?? [])
  const lines = events
    .map((event) => event.text ?? event.payload?.text ?? event.payload?.message)
    .filter((line): line is string => Boolean(line?.trim()))

  const focused = lines.filter(
    (line) =>
      /error|failed|ERR!|Module not found|Type error|Cannot find/i.test(line) ||
      lines.length <= 40
  )

  const log = (focused.length > 0 ? focused : lines).join('\n')
  if (log.length <= MAX_BUILD_LOG_CHARS) {
    return log
  }
  return `${log.slice(-MAX_BUILD_LOG_CHARS)}\n…(truncated)`
}

function formatDeploymentFailure(deployment: VercelDeployment, buildLog: string): string {
  const parts = [
    deployment.errorMessage,
    deployment.errorCode ? `code: ${deployment.errorCode}` : undefined,
    deployment.inspectorUrl ? `Inspector: ${deployment.inspectorUrl}` : undefined,
    buildLog ? `Build log:\n${buildLog}` : undefined,
  ].filter(Boolean)

  return parts.length > 0 ? parts.join('\n') : 'Vercel build failed (no log details returned)'
}

function resolveLiveUrl(deployment: VercelDeployment, projectName: string): string {
  const alias = deployment.alias?.find((entry) => entry.includes('.vercel.app'))
  if (alias) {
    return toHttpsUrl(alias)
  }
  if (deployment.url) {
    return toHttpsUrl(deployment.url)
  }
  return `https://${projectName}.vercel.app`
}

async function waitForDeploymentReady(
  token: string,
  deploymentId: string,
  teamId?: string
): Promise<VercelDeployment> {
  const deadline = Date.now() + DEPLOY_TIMEOUT_MS

  while (Date.now() < deadline) {
    const deployment = await getVercelDeployment(token, deploymentId, teamId)
    const state = deployment.readyState?.toUpperCase()

    if (state === 'READY') {
      return deployment
    }
    if (state === 'ERROR' || state === 'CANCELED') {
      const buildLog = await fetchDeploymentBuildLog(token, deploymentId, teamId)
      throw new Error(formatDeploymentFailure(deployment, buildLog))
    }

    await sleep(DEPLOY_POLL_INTERVAL_MS)
  }

  throw new Error('Vercel deployment timed out while waiting for READY state')
}

/**
 * Links a GitHub repository to a Vercel project and deploys the default branch to production.
 */
export async function deployGeneratedAppToVercel(
  input: DeployGeneratedAppToVercelInput
): Promise<DeployGeneratedAppToVercelResult> {
  const token = input.vercelToken?.trim()
  if (!token) {
    return { success: false, error: 'Vercel token is required' }
  }

  const githubOwner = input.githubOwner?.trim()
  const githubRepoName = input.githubRepoName?.trim()
  if (!githubOwner || !githubRepoName) {
    return { success: false, error: 'GitHub owner and repository name are required for Vercel deploy' }
  }

  const projectName = input.projectName.trim()
  const gitRef = input.gitRef?.trim() || DEFAULT_GIT_REF
  const githubRepo = `${githubOwner}/${githubRepoName}`

  try {
    logger.info('Creating or reusing Vercel project', { projectName, githubRepo })

    let project = await createVercelProject(token, projectName, githubRepo, input.vercelTeamId)

    if (!project.link?.repoId) {
      const refreshed = await getVercelProjectByName(token, projectName, input.vercelTeamId)
      if (refreshed) {
        project = refreshed
      }
    }

    logger.info('Triggering Vercel deployment from Git', {
      projectId: project.id,
      gitRef,
      repoId: project.link?.repoId,
      githubRepo,
    })

    const created = await createGitDeployment(
      token,
      project,
      gitRef,
      githubOwner,
      githubRepoName,
      input.vercelTeamId
    )
    const ready = await waitForDeploymentReady(token, created.id, input.vercelTeamId)

    const vercelUrl = resolveLiveUrl(ready, project.name)
    const vercelDeploymentUrl = ready.url ? toHttpsUrl(ready.url) : vercelUrl

    logger.info('Vercel deployment ready', {
      projectId: project.id,
      deploymentId: ready.id,
      vercelUrl,
    })

    return {
      success: true,
      vercelUrl,
      vercelDeploymentUrl,
      vercelProjectId: project.id,
      vercelDeploymentId: ready.id,
      vercelInspectorUrl: ready.inspectorUrl,
    }
  } catch (error) {
    const message = toError(error).message
    logger.error('Vercel deployment failed', { error: message })
    return { success: false, error: message }
  }
}

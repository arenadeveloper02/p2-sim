import { createLogger } from '@sim/logger'
import { sleep } from '@sim/utils/helpers'
import { toError } from '@sim/utils/errors'
import { provisionNeonDatabase } from '@/lib/development/provision-vercel-neon-database'
import { DEVELOPMENT_REQUIRES_DATABASE } from '@/lib/development/resolve-development-env'
import { projectHasDatabaseUrl } from '@/lib/development/vercel-project-env'
import { logGeneratedAppValidationErrors } from '@/lib/development/format-generated-app-build-errors'

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
  requiresDatabase?: boolean
  neonIntegrationConfigurationId?: string
  neonApiKey?: string
  neonOrgId?: string
}

export interface PrepareVercelProjectInput {
  vercelToken: string
  projectName: string
  githubOwner: string
  githubRepoName: string
  vercelTeamId?: string
  requiresDatabase?: boolean
  neonIntegrationConfigurationId?: string
  neonApiKey?: string
  neonOrgId?: string
  /**
   * When true, always provision a new Neon database even if DATABASE_URL already exists.
   * Default: reuse existing DATABASE_URL when present.
   */
  forceDatabaseProvisioning?: boolean
}

export interface PrepareVercelProjectResult {
  success: boolean
  vercelProjectId?: string
  vercelProjectName?: string
  databaseProvisioned?: boolean
  neonProjectId?: string
  databaseUrl?: string
  databaseProvisionError?: string
  error?: string
}

export interface DeployPreparedVercelProjectInput {
  vercelToken: string
  vercelProjectId: string
  vercelProjectName: string
  githubOwner: string
  githubRepoName: string
  githubToken?: string
  outputDir?: string
  vercelTeamId?: string
  gitRef?: string
  gitCommitSha?: string
  gitHubRepoId?: number
  databaseProvisioned?: boolean
  neonProjectId?: string
}

export interface DeployGeneratedAppToVercelResult {
  success: boolean
  vercelUrl?: string
  vercelDeploymentUrl?: string
  vercelProjectId?: string
  vercelDeploymentId?: string
  vercelInspectorUrl?: string
  databaseProvisioned?: boolean
  neonProjectId?: string
  databaseProvisionError?: string
  error?: string
}

interface VercelProjectLink {
  type?: string
  org?: string
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

/**
 * True when the project is already git-linked to the given "owner/name" GitHub repo,
 * in which case the link call can be skipped.
 */
function isProjectLinkedToGitHubRepo(project: VercelProject, githubRepo: string): boolean {
  const link = project.link
  if (!link || link.type !== 'github' || !link.repoId) {
    return false
  }
  if (!link.org || !link.repo) {
    return true
  }
  return `${link.org}/${link.repo}`.toLowerCase() === githubRepo.toLowerCase()
}

/**
 * Connects the project to a GitHub repo via POST /v9/projects/{id}/link —
 * PATCH /v9/projects no longer accepts a gitRepository property.
 */
async function linkVercelProjectToGitHub(
  token: string,
  projectId: string,
  githubRepo: string,
  teamId?: string
): Promise<VercelProject> {
  const body = JSON.stringify({
    type: 'github',
    repo: githubRepo,
  })

  const { data, status } = await vercelRequest<VercelProject>(
    token,
    `/v9/projects/${encodeURIComponent(projectId)}/link`,
    { method: 'POST', body },
    teamId
  )

  if (status !== 200 && status !== 201) {
    throw new Error(vercelErrorMessage(data, status))
  }

  return data
}

function buildGitSource(
  gitRef: string,
  repoId: number,
  commitSha?: string
): Record<string, string> {
  const branchRef = gitRef.startsWith('refs/') ? gitRef : `refs/heads/${gitRef}`

  return {
    type: 'github',
    repoId: String(repoId),
    ref: branchRef,
    ...(commitSha ? { sha: commitSha } : {}),
  }
}

async function createGitDeployment(
  token: string,
  project: VercelProject,
  gitRef: string,
  repoId: number,
  teamId?: string,
  commitSha?: string
): Promise<VercelDeployment> {
  const body = JSON.stringify({
    name: project.name,
    project: project.id,
    target: 'production',
    gitSource: buildGitSource(gitRef, repoId, commitSha),
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
      logGeneratedAppValidationErrors({
        phase: 'vercel',
        round: 0,
        output: buildLog,
      })
      throw new Error(formatDeploymentFailure(deployment, buildLog))
    }

    await sleep(DEPLOY_POLL_INTERVAL_MS)
  }

  throw new Error('Vercel deployment timed out while waiting for READY state')
}

/**
 * Creates or reuses a Vercel project linked to GitHub and provisions Neon before any git push.
 * DATABASE_URL must exist before Vercel auto-deploys on push.
 */
export async function prepareVercelProjectForDeploy(
  input: PrepareVercelProjectInput
): Promise<PrepareVercelProjectResult> {
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
  const githubRepo = `${githubOwner}/${githubRepoName}`

  try {
    logger.info('Creating or reusing Vercel project before git push', { projectName, githubRepo })

    let project = await createVercelProject(token, projectName, githubRepo, input.vercelTeamId)

    if (!isProjectLinkedToGitHubRepo(project, githubRepo)) {
      try {
        project = await linkVercelProjectToGitHub(
          token,
          project.id,
          githubRepo,
          input.vercelTeamId
        )
      } catch (error) {
        logger.warn('Failed to refresh Vercel project GitHub link', {
          projectId: project.id,
          githubRepo,
          error: toError(error).message,
        })
      }
    }

    if (!project.link?.repoId) {
      const refreshed = await getVercelProjectByName(token, projectName, input.vercelTeamId)
      if (refreshed) {
        project = refreshed
      }
    }

    let databaseProvisioned = false
    let neonProjectId: string | undefined
    let databaseUrl: string | undefined

    const needsDatabase = input.requiresDatabase !== false && DEVELOPMENT_REQUIRES_DATABASE
    let shouldProvisionDatabase = needsDatabase

    if (needsDatabase && !input.forceDatabaseProvisioning) {
      const hasExistingDatabase = await projectHasDatabaseUrl(token, project.id, input.vercelTeamId)
      if (hasExistingDatabase) {
        databaseProvisioned = true
        shouldProvisionDatabase = false
        logger.info('Reusing existing DATABASE_URL on Vercel project', {
          projectId: project.id,
        })
      }
    }

    if (shouldProvisionDatabase) {
      const neonResult = await provisionNeonDatabase({
        vercelToken: token,
        vercelProjectId: project.id,
        storeName: `${projectName}-db`,
        vercelTeamId: input.vercelTeamId,
        integrationConfigurationId: input.neonIntegrationConfigurationId,
        neonApiKey: input.neonApiKey,
        neonOrgId: input.neonOrgId,
      })

      if (!neonResult.success) {
        const databaseProvisionError =
          neonResult.error ?? 'Failed to provision Neon Postgres via Vercel'
        return {
          success: false,
          error: databaseProvisionError,
          vercelProjectId: project.id,
          vercelProjectName: project.name,
          databaseProvisioned: false,
          databaseProvisionError,
        }
      }

      databaseProvisioned = true
      neonProjectId = neonResult.neonProjectId ?? neonResult.storeResourceId
      databaseUrl = neonResult.databaseUrl
      logger.info('Neon Postgres linked to Vercel project via marketplace integration', {
        projectId: project.id,
        neonProjectId,
        storeResourceId: neonResult.storeResourceId,
        hasDatabaseUrl: Boolean(databaseUrl),
      })
    }

    return {
      success: true,
      vercelProjectId: project.id,
      vercelProjectName: project.name,
      databaseProvisioned,
      neonProjectId,
      databaseUrl,
    }
  } catch (error) {
    const message = toError(error).message
    logger.error('Vercel project preparation failed', { error: message })
    return { success: false, error: message }
  }
}

/**
 * Triggers a production deployment for a prepared Vercel project and waits until READY.
 */
export async function deployPreparedVercelProject(
  input: DeployPreparedVercelProjectInput
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

  try {
    let gitRef = input.gitRef?.trim() || DEFAULT_GIT_REF
    let gitCommitSha = input.gitCommitSha?.trim()
    let gitHubRepoId = input.gitHubRepoId
    let resolvedOwner = githubOwner
    let resolvedRepoName = githubRepoName
    let remoteUrl: string | undefined

    if (input.githubToken?.trim()) {
      const {
        fetchGitHubRepositoryDetails,
        waitForGitHubCommit,
        fetchGitHubBranchHeadSha,
      } = await import('@/lib/development/fetch-github-repository')

      const repoDetails = await fetchGitHubRepositoryDetails(
        input.githubToken,
        githubRepoName,
        githubOwner
      )

      resolvedOwner = repoDetails.owner
      resolvedRepoName = repoDetails.name
      gitRef = repoDetails.defaultBranch
      gitHubRepoId = repoDetails.id
      remoteUrl = repoDetails.htmlUrl

      if (gitCommitSha) {
        await waitForGitHubCommit(input.githubToken, repoDetails, gitCommitSha)
      } else {
        gitCommitSha = await fetchGitHubBranchHeadSha(input.githubToken, repoDetails, gitRef)
      }

      logger.info('Resolved GitHub repository for Vercel deploy', {
        fullName: repoDetails.fullName,
        repoId: gitHubRepoId,
        gitRef,
        gitCommitSha,
      })
    }

    const resolvedGithubRepo = `${resolvedOwner}/${resolvedRepoName}`

    let project = await getVercelProjectByName(token, input.vercelProjectName, input.vercelTeamId)
    if (!project) {
      return {
        success: false,
        error: `Vercel project "${input.vercelProjectName}" was not found`,
        vercelProjectId: input.vercelProjectId,
      }
    }

    if (!isProjectLinkedToGitHubRepo(project, resolvedGithubRepo)) {
      try {
        project = await linkVercelProjectToGitHub(
          token,
          project.id,
          resolvedGithubRepo,
          input.vercelTeamId
        )
      } catch (error) {
        logger.warn('Failed to refresh Vercel project GitHub link before deploy', {
          projectId: project.id,
          githubRepo: resolvedGithubRepo,
          error: toError(error).message,
        })
      }
    }

    if (!gitHubRepoId) {
      gitHubRepoId = project.link?.repoId
    }

    if (!gitHubRepoId) {
      return {
        success: false,
        error:
          'Could not resolve GitHub repository ID for Vercel deploy. Set DEVELOPMENT_GITHUB_TOKEN so repo details can be fetched from GitHub.',
        vercelProjectId: input.vercelProjectId,
      }
    }

    if (!gitCommitSha) {
      return {
        success: false,
        error: 'Could not resolve GitHub commit SHA for Vercel deploy',
        vercelProjectId: input.vercelProjectId,
      }
    }

    logger.info('Triggering Vercel deployment from Git', {
      projectId: project.id,
      gitRef,
      repoId: gitHubRepoId,
      commitSha: gitCommitSha,
      githubRepo: resolvedGithubRepo,
    })

    let ready: VercelDeployment
    try {
      const created = await createGitDeployment(
        token,
        project,
        gitRef,
        gitHubRepoId,
        input.vercelTeamId,
        gitCommitSha
      )
      ready = await waitForDeploymentReady(token, created.id, input.vercelTeamId)
    } catch (gitDeployError) {
      const gitMessage = toError(gitDeployError).message
      const shouldFallback =
        /git_info_fail|incorrect_git_source_info|unable to fetch required git information/i.test(
          gitMessage
        ) && Boolean(input.outputDir)

      if (!shouldFallback) {
        throw gitDeployError
      }

      logger.warn('Git-based Vercel deploy failed; falling back to file upload deploy', {
        projectId: project.id,
        error: gitMessage,
      })

      const { deployVercelProjectFromFiles } = await import(
        '@/lib/development/deploy-vercel-from-files'
      )
      const fileDeploy = await deployVercelProjectFromFiles({
        vercelToken: token,
        vercelProjectId: project.id,
        vercelProjectName: project.name,
        outputDir: input.outputDir as string,
        vercelTeamId: input.vercelTeamId,
        gitMetadata: {
          remoteUrl,
          commitSha: gitCommitSha,
          commitRef: gitRef,
          commitMessage: 'Sim Development deployment',
        },
      })

      if (!fileDeploy.success) {
        return {
          success: false,
          error: `${gitMessage}\n\nFile upload deploy fallback also failed: ${fileDeploy.error}`,
          vercelProjectId: input.vercelProjectId,
        }
      }

      return {
        success: true,
        vercelUrl: fileDeploy.vercelUrl,
        vercelDeploymentUrl: fileDeploy.vercelDeploymentUrl,
        vercelProjectId: fileDeploy.vercelProjectId,
        vercelDeploymentId: fileDeploy.vercelDeploymentId,
        vercelInspectorUrl: fileDeploy.vercelInspectorUrl,
        databaseProvisioned: input.databaseProvisioned,
        neonProjectId: input.neonProjectId,
      }
    }

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
      databaseProvisioned: input.databaseProvisioned,
      neonProjectId: input.neonProjectId,
    }
  } catch (error) {
    const message = toError(error).message
    logger.error('Vercel deployment failed', { error: message })
    return { success: false, error: message, vercelProjectId: input.vercelProjectId }
  }
}

/**
 * Links a GitHub repository to a Vercel project and deploys the default branch to production.
 */
export async function deployGeneratedAppToVercel(
  input: DeployGeneratedAppToVercelInput
): Promise<DeployGeneratedAppToVercelResult> {
  const prepared = await prepareVercelProjectForDeploy(input)
  if (!prepared.success || !prepared.vercelProjectId || !prepared.vercelProjectName) {
    return {
      success: false,
      error: prepared.error,
      vercelProjectId: prepared.vercelProjectId,
      databaseProvisioned: prepared.databaseProvisioned,
      neonProjectId: prepared.neonProjectId,
      databaseProvisionError: prepared.databaseProvisionError,
    }
  }

  return deployPreparedVercelProject({
    vercelToken: input.vercelToken,
    vercelProjectId: prepared.vercelProjectId,
    vercelProjectName: prepared.vercelProjectName,
    githubOwner: input.githubOwner,
    githubRepoName: input.githubRepoName,
    vercelTeamId: input.vercelTeamId,
    gitRef: input.gitRef,
    databaseProvisioned: prepared.databaseProvisioned,
    neonProjectId: prepared.neonProjectId,
  })
}

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'fs'
import { mkdir, rm } from 'fs/promises'
import { join } from 'path'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { getGeneratedAppDir } from '@/lib/development/generated-apps-paths'
import { resolveDevelopmentDeployEnv } from '@/lib/development/resolve-development-env'

const logger = createLogger('EnsureLocalGeneratedApp')
const execFileAsync = promisify(execFile)

const GITHUB_API = 'https://api.github.com'

export interface EnsureLocalGeneratedAppResult {
  success: boolean
  outputDir?: string
  githubOwner?: string
  githubRepoName?: string
  githubHtmlUrl?: string
  githubCloneUrl?: string
  error?: string
}

interface GitHubRepoResponse {
  name: string
  html_url: string
  clone_url: string
  owner: { login: string }
}

async function githubFetch<T>(token: string, path: string): Promise<{ data: T; status: number }> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  const text = await response.text()
  let data: T
  try {
    data = text ? (JSON.parse(text) as T) : ({} as T)
  } catch {
    throw new Error(`GitHub API returned invalid JSON (${response.status})`)
  }

  return { data, status: response.status }
}

async function resolveGitHubOwner(token: string, ownerHint?: string): Promise<string> {
  const trimmed = ownerHint?.trim()
  if (trimmed) {
    return trimmed
  }

  const { data, status } = await githubFetch<{ login: string }>(token, '/user')
  if (status !== 200 || !data.login) {
    throw new Error('Failed to resolve GitHub owner from token')
  }
  return data.login
}

function buildAuthenticatedRemoteUrl(token: string, owner: string, repoName: string): string {
  return `https://x-access-token:${encodeURIComponent(token)}@github.com/${owner}/${repoName}.git`
}

async function runGit(cwd: string, args: string[]): Promise<void> {
  await execFileAsync('git', args, {
    cwd,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  })
}

async function cloneRepository(remoteUrl: string, outputDir: string): Promise<void> {
  await mkdir(join(outputDir, '..'), { recursive: true })
  await execFileAsync('git', ['clone', '--depth', '1', remoteUrl, outputDir], {
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024,
  })
}

async function pullLatestChanges(outputDir: string): Promise<void> {
  await runGit(outputDir, ['fetch', 'origin'])
  await runGit(outputDir, ['reset', '--hard', 'origin/HEAD'])
}

/**
 * Ensures a local copy of the generated app exists, cloning from GitHub when needed.
 */
export async function ensureLocalGeneratedApp(
  repoName: string
): Promise<EnsureLocalGeneratedAppResult> {
  const trimmedRepoName = repoName.trim()
  if (!trimmedRepoName) {
    return { success: false, error: 'Repository name is required' }
  }

  const outputDir = getGeneratedAppDir(trimmedRepoName)

  try {
    if (existsSync(outputDir)) {
      const gitDir = join(outputDir, '.git')
      if (existsSync(gitDir)) {
        try {
          await pullLatestChanges(outputDir)
        } catch (error) {
          logger.warn('Failed to pull latest changes; using existing local copy', {
            repoName: trimmedRepoName,
            error: toError(error).message,
          })
        }
      }

      return {
        success: true,
        outputDir,
        githubRepoName: trimmedRepoName,
      }
    }

    const { githubToken, githubOwner } = resolveDevelopmentDeployEnv()
    if (!githubToken) {
      return {
        success: false,
        error:
          'Local copy not found and DEVELOPMENT_GITHUB_TOKEN is not set to clone the repository.',
      }
    }

    const owner = await resolveGitHubOwner(githubToken, githubOwner)
    const { data: repo, status } = await githubFetch<GitHubRepoResponse>(
      githubToken,
      `/repos/${owner}/${trimmedRepoName}`
    )

    if (status !== 200) {
      return {
        success: false,
        error: `GitHub repository "${owner}/${trimmedRepoName}" was not found.`,
      }
    }

    const remoteUrl = buildAuthenticatedRemoteUrl(githubToken, owner, repo.name)

    if (existsSync(outputDir)) {
      await rm(outputDir, { recursive: true, force: true })
    }

    logger.info('Cloning generated app repository for edit', {
      owner,
      repoName: repo.name,
      outputDir,
    })
    await cloneRepository(remoteUrl, outputDir)

    return {
      success: true,
      outputDir,
      githubOwner: repo.owner.login,
      githubRepoName: repo.name,
      githubHtmlUrl: repo.html_url,
      githubCloneUrl: repo.clone_url,
    }
  } catch (error) {
    const message = toError(error).message
    logger.error('Failed to ensure local generated app copy', {
      repoName: trimmedRepoName,
      error: message,
    })
    return { success: false, error: message }
  }
}

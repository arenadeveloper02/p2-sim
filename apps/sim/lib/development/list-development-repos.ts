import { existsSync } from 'fs'
import { readdir } from 'fs/promises'
import { createLogger } from '@sim/logger'
import { toError } from '@sim/utils/errors'
import { getGeneratedAppsDir } from '@/lib/development/generated-apps-paths'
import { resolveDevelopmentDeployEnv } from '@/lib/development/resolve-development-env'

const logger = createLogger('ListDevelopmentRepos')

const GITHUB_API = 'https://api.github.com'

export interface DevelopmentRepoOption {
  id: string
  name: string
  source: 'local' | 'github' | 'both'
  description?: string
  htmlUrl?: string
  updatedAt?: string
}

interface GitHubRepoListItem {
  name: string
  description: string | null
  html_url: string
  updated_at: string
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

async function listLocalGeneratedRepos(): Promise<DevelopmentRepoOption[]> {
  const generatedAppsDir = getGeneratedAppsDir()

  if (!existsSync(generatedAppsDir)) {
    return []
  }

  const entries = await readdir(generatedAppsDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => ({
      id: entry.name,
      name: entry.name,
      source: 'local' as const,
    }))
}

async function listGitHubDevelopmentRepos(
  token: string,
  ownerHint?: string
): Promise<DevelopmentRepoOption[]> {
  const owner = await resolveGitHubOwner(token, ownerHint)
  const { data: user } = await githubFetch<{ login: string }>(token, '/user')
  const isOrg = owner !== user.login
  const path = isOrg
    ? `/orgs/${encodeURIComponent(owner)}/repos?per_page=100&sort=updated&direction=desc`
    : '/user/repos?per_page=100&sort=updated&direction=desc&affiliation=owner'

  const { data, status } = await githubFetch<GitHubRepoListItem[]>(token, path)
  if (status !== 200 || !Array.isArray(data)) {
    throw new Error(`Failed to list GitHub repositories (${status})`)
  }

  return data.map((repo) => ({
    id: repo.name,
    name: repo.name,
    source: 'github' as const,
    description: repo.description ?? undefined,
    htmlUrl: repo.html_url,
    updatedAt: repo.updated_at,
  }))
}

/**
 * Lists repositories available for Development block edit mode (local generated-apps + GitHub).
 */
export async function listDevelopmentRepos(): Promise<{
  success: boolean
  repos: DevelopmentRepoOption[]
  error?: string
}> {
  try {
    const byName = new Map<string, DevelopmentRepoOption>()

    const localRepos = await listLocalGeneratedRepos()
    for (const repo of localRepos) {
      byName.set(repo.id, repo)
    }

    const { githubToken, githubOwner } = resolveDevelopmentDeployEnv()
    if (githubToken) {
      try {
        const githubRepos = await listGitHubDevelopmentRepos(githubToken, githubOwner)
        for (const repo of githubRepos) {
          const existing = byName.get(repo.id)
          if (existing) {
            byName.set(repo.id, {
              ...existing,
              ...repo,
              source: 'both',
            })
          } else {
            byName.set(repo.id, repo)
          }
        }
      } catch (error) {
        logger.warn('Failed to list GitHub repos for Development block', {
          error: toError(error).message,
        })
      }
    }

    const repos = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
    return { success: true, repos }
  } catch (error) {
    const message = toError(error).message
    logger.error('Failed to list development repos', { error: message })
    return { success: false, repos: [], error: message }
  }
}

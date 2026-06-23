import { createLogger } from '@sim/logger'
import { sleep } from '@sim/utils/helpers'
import { toError } from '@sim/utils/errors'

const logger = createLogger('FetchGitHubRepository')

const GITHUB_API = 'https://api.github.com'

export interface GitHubRepositoryDetails {
  id: number
  owner: string
  name: string
  fullName: string
  defaultBranch: string
  htmlUrl: string
  cloneUrl: string
  isPrivate: boolean
}

interface GitHubRepoApiResponse {
  id: number
  name: string
  full_name: string
  html_url: string
  clone_url: string
  default_branch: string
  private: boolean
  owner: { login: string }
}

interface GitHubUserResponse {
  login: string
}

async function githubFetch<T>(
  token: string,
  path: string
): Promise<{ data: T; status: number }> {
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

function mapRepoResponse(repo: GitHubRepoApiResponse): GitHubRepositoryDetails {
  return {
    id: repo.id,
    owner: repo.owner.login,
    name: repo.name,
    fullName: repo.full_name,
    defaultBranch: repo.default_branch || 'main',
    htmlUrl: repo.html_url,
    cloneUrl: repo.clone_url,
    isPrivate: repo.private,
  }
}

/**
 * Fetches canonical GitHub repository metadata used for git push and Vercel deploy.
 */
export async function fetchGitHubRepositoryDetails(
  token: string,
  repoName: string,
  ownerHint?: string
): Promise<GitHubRepositoryDetails> {
  const trimmedToken = token.trim()
  const trimmedRepoName = repoName.trim()
  if (!trimmedToken) {
    throw new Error('GitHub token is required to fetch repository details')
  }
  if (!trimmedRepoName) {
    throw new Error('Repository name is required')
  }

  const ownersToTry: string[] = []
  const trimmedOwnerHint = ownerHint?.trim()
  if (trimmedOwnerHint) {
    ownersToTry.push(trimmedOwnerHint)
  }

  const { data: user, status: userStatus } = await githubFetch<GitHubUserResponse>(
    trimmedToken,
    '/user'
  )
  if (userStatus === 200 && user.login && !ownersToTry.includes(user.login)) {
    ownersToTry.push(user.login)
  }

  for (const owner of ownersToTry) {
    const { data, status } = await githubFetch<GitHubRepoApiResponse>(
      trimmedToken,
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(trimmedRepoName)}`
    )
    if (status === 200) {
      const details = mapRepoResponse(data)
      logger.info('Resolved GitHub repository details', {
        fullName: details.fullName,
        repoId: details.id,
        defaultBranch: details.defaultBranch,
      })
      return details
    }
  }

  const { data: searchResult, status: searchStatus } = await githubFetch<{
    items?: GitHubRepoApiResponse[]
  }>(
    trimmedToken,
    `/search/repositories?q=${encodeURIComponent(`${trimmedRepoName} in:name`)}&per_page=5`
  )

  if (searchStatus === 200 && Array.isArray(searchResult.items)) {
    const exactMatch = searchResult.items.find(
      (item) => item.name.toLowerCase() === trimmedRepoName.toLowerCase()
    )
    if (exactMatch) {
      const details = mapRepoResponse(exactMatch)
      logger.info('Resolved GitHub repository details via search', {
        fullName: details.fullName,
        repoId: details.id,
      })
      return details
    }
  }

  throw new Error(
    `GitHub repository "${trimmedRepoName}" was not found. Check DEVELOPMENT_GITHUB_OWNER and repository access.`
  )
}

/**
 * Waits until a commit SHA is visible on GitHub (needed before Vercel git deploy).
 */
export async function waitForGitHubCommit(
  token: string,
  details: GitHubRepositoryDetails,
  commitSha: string,
  options?: { maxAttempts?: number; delayMs?: number }
): Promise<void> {
  const maxAttempts = options?.maxAttempts ?? 12
  const delayMs = options?.delayMs ?? 2_500

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const { status } = await githubFetch<unknown>(
      token,
      `/repos/${encodeURIComponent(details.owner)}/${encodeURIComponent(details.name)}/commits/${encodeURIComponent(commitSha)}`
    )

    if (status === 200) {
      logger.info('GitHub commit is available for Vercel deploy', {
        fullName: details.fullName,
        commitSha,
        attempt,
      })
      return
    }

    logger.info('Waiting for GitHub commit to become available', {
      fullName: details.fullName,
      commitSha,
      attempt,
      status,
    })
    await sleep(delayMs)
  }

  throw new Error(
    `Timed out waiting for commit ${commitSha} on ${details.fullName}. GitHub may still be indexing the push.`
  )
}

/**
 * Returns the current HEAD commit SHA for a branch from GitHub.
 */
export async function fetchGitHubBranchHeadSha(
  token: string,
  details: GitHubRepositoryDetails,
  branch = details.defaultBranch
): Promise<string> {
  const { data, status } = await githubFetch<{ sha?: string }>(
    token,
    `/repos/${encodeURIComponent(details.owner)}/${encodeURIComponent(details.name)}/commits/${encodeURIComponent(branch)}`
  )

  if (status !== 200 || !data.sha) {
    throw new Error(`Failed to resolve branch head for ${details.fullName}@${branch}`)
  }

  return data.sha
}

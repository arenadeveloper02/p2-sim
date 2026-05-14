import { toError } from '@sim/utils/errors'
import type { SkillNodeInput } from '@/lib/workflows/skills/operations'

const FETCH_TIMEOUT_MS = 15_000
const MAX_FILES = 200
const MAX_FILE_BYTES = 200_000
const MAX_TOTAL_BYTES = 2_000_000
const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/
const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mdx',
  '.py',
  '.sh',
  '.sql',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.xml',
  '.yaml',
  '.yml',
])

interface GitHubLocation {
  owner: string
  repo: string
  ref: string
  path: string
  mode: 'blob' | 'tree' | 'raw' | 'repo'
}

interface GitTreeItem {
  path: string
  mode: string
  type: 'blob' | 'tree' | 'commit'
  size?: number
  sha: string
  url: string
}

interface GitTreeResponse {
  tree: GitTreeItem[]
  truncated?: boolean
}

interface GitHubRepositoryResponse {
  default_branch?: string
}

interface ParsedSkillMarkdown {
  name: string
  description: string
  content: string
  allowedTools: string[] | null
}

export interface GitHubSkillImportPreview {
  name: string
  description: string
  content: string
  sourceUrl: string
  sourceType: 'github'
  rootPath: string
  nodes: SkillNodeInput[]
  fileCount: number
  skillCount: number
  totalBytes: number
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+/g, '/').replace(/\/$/, '')
}

function dirname(path: string): string {
  const idx = path.lastIndexOf('/')
  return idx === -1 ? '' : path.slice(0, idx)
}

function basename(path: string): string {
  const parts = path.split('/')
  return parts[parts.length - 1] || path
}

function getExtension(path: string): string {
  const name = basename(path).toLowerCase()
  const idx = name.lastIndexOf('.')
  return idx === -1 ? '' : name.slice(idx)
}

function isTextPath(path: string): boolean {
  return TEXT_EXTENSIONS.has(getExtension(path))
}

function inferNameFromHeading(markdown: string): string {
  const headingMatch = markdown.match(/^#{1,3}\s+(.+)$/m)
  if (!headingMatch) return ''

  return headingMatch[1]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
}

function parseAllowedTools(value: string): string[] {
  const trimmed = value.trim().replace(/^\[|\]$/g, '')
  return trimmed
    .split(',')
    .map((item) => item.trim().replace(/^['"]|['"]$/g, ''))
    .filter(Boolean)
}

export function parseSkillFrontmatter(raw: string): ParsedSkillMarkdown {
  const trimmed = raw.replace(/\r\n/g, '\n').trim()
  const match = trimmed.match(FRONTMATTER_REGEX)

  if (!match) {
    return {
      name: inferNameFromHeading(trimmed),
      description: '',
      content: trimmed,
      allowedTools: null,
    }
  }

  const frontmatter = match[1]
  const body = (match[2] ?? '').trim()
  let name = ''
  let description = ''
  let allowedTools: string[] | null = null

  for (const line of frontmatter.split('\n')) {
    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue

    const key = line.slice(0, colonIdx).trim().toLowerCase()
    const value = line
      .slice(colonIdx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '')

    if (key === 'name') {
      name = value
    } else if (key === 'description') {
      description = value
    } else if (key === 'allowed-tools' || key === 'allowed_tools') {
      allowedTools = parseAllowedTools(value)
    }
  }

  return {
    name: name || inferNameFromHeading(body),
    description,
    content: body,
    allowedTools,
  }
}

export function parseGitHubUrl(url: string): GitHubLocation {
  const parsed = new URL(url)

  if (parsed.hostname === 'raw.githubusercontent.com') {
    const segments = parsed.pathname.split('/').filter(Boolean)
    if (segments.length < 4) {
      throw new Error('Invalid raw GitHub URL format')
    }

    const [owner, repo, ref, ...pathParts] = segments
    return { owner, repo, ref, path: normalizePath(pathParts.join('/')), mode: 'raw' }
  }

  if (parsed.hostname !== 'github.com') {
    throw new Error('Only GitHub URLs are supported')
  }

  const segments = parsed.pathname.split('/').filter(Boolean)
  if (segments.length === 2) {
    const [owner, repo] = segments
    return { owner, repo, ref: '', path: '', mode: 'repo' }
  }

  if (segments.length < 5 || (segments[2] !== 'blob' && segments[2] !== 'tree')) {
    throw new Error(
      'Invalid GitHub URL format. Expected a GitHub repository, blob, raw, or tree URL for a skills directory.'
    )
  }

  const [owner, repo, mode, ref, ...pathParts] = segments
  return {
    owner,
    repo,
    ref,
    path: normalizePath(pathParts.join('/')),
    mode: mode as 'blob' | 'tree',
  }
}

async function resolveDefaultBranch(location: GitHubLocation): Promise<string> {
  const apiUrl = `https://api.github.com/repos/${location.owner}/${location.repo}`
  const response = await fetch(apiUrl, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: 'application/vnd.github+json' },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch repository metadata (HTTP ${response.status})`)
  }

  const data = (await response.json()) as GitHubRepositoryResponse
  if (!data.default_branch) {
    throw new Error('Repository default branch could not be resolved')
  }

  return data.default_branch
}

function buildRawUrl(location: GitHubLocation, path = location.path): string {
  const encodedPath = path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `https://raw.githubusercontent.com/${location.owner}/${location.repo}/${encodeURIComponent(
    location.ref
  )}/${encodedPath}`
}

async function fetchText(url: string): Promise<{ content: string; bytes: number }> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: 'text/plain' },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch file (HTTP ${response.status}). Is the repository public?`)
  }

  const contentLength = response.headers.get('content-length')
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_FILE_BYTES) {
    throw new Error(`File is too large (max ${MAX_FILE_BYTES} bytes)`)
  }

  const content = await response.text()
  const bytes = new TextEncoder().encode(content).byteLength
  if (bytes > MAX_FILE_BYTES) {
    throw new Error(`File is too large (max ${MAX_FILE_BYTES} bytes)`)
  }

  return { content, bytes }
}

async function fetchTree(location: GitHubLocation): Promise<GitTreeItem[]> {
  const apiUrl = `https://api.github.com/repos/${location.owner}/${location.repo}/git/trees/${encodeURIComponent(
    location.ref
  )}?recursive=1`
  const response = await fetch(apiUrl, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: { Accept: 'application/vnd.github+json' },
  })

  if (!response.ok) {
    throw new Error(`Failed to fetch repository tree (HTTP ${response.status})`)
  }

  const data = (await response.json()) as GitTreeResponse
  if (data.truncated) {
    throw new Error('Repository tree is too large to import')
  }

  return data.tree
}

function addFolderAncestors(nodes: Map<string, SkillNodeInput>, path: string): void {
  const parts = path.split('/')
  for (let index = 1; index <= parts.length; index += 1) {
    const folderPath = parts.slice(0, index).join('/')
    if (!folderPath || nodes.has(folderPath)) continue

    nodes.set(folderPath, {
      path: folderPath,
      type: 'folder',
      name: basename(folderPath),
      description: null,
      content: null,
    })
  }
}

function sortNodes(nodes: SkillNodeInput[]): SkillNodeInput[] {
  return nodes
    .slice()
    .sort(
      (a, b) =>
        a.path.split('/').length - b.path.split('/').length ||
        a.path.localeCompare(b.path) ||
        a.type.localeCompare(b.type)
    )
    .map((node, index) => ({ ...node, sortOrder: index }))
}

function buildSingleFilePreview(
  location: GitHubLocation,
  sourceUrl: string,
  rawContent: string,
  bytes: number
): GitHubSkillImportPreview {
  const parsed = parseSkillFrontmatter(rawContent)
  const name = parsed.name || basename(location.path).replace(/\.[^.]+$/, '') || 'imported-skill'
  const description = parsed.description || `Imported from ${location.owner}/${location.repo}`
  const node: SkillNodeInput = {
    path: 'SKILL.md',
    type: 'skill',
    name,
    description,
    content: parsed.content,
    allowedTools: parsed.allowedTools,
    sortOrder: 0,
  }

  return {
    name,
    description,
    content: parsed.content,
    sourceUrl,
    sourceType: 'github',
    rootPath: location.path,
    nodes: [node],
    fileCount: 1,
    skillCount: 1,
    totalBytes: bytes,
  }
}

export async function importGitHubSkillPack(url: string): Promise<GitHubSkillImportPreview> {
  try {
    const location = parseGitHubUrl(url)

    if (location.mode !== 'tree' && location.mode !== 'repo') {
      const { content, bytes } = await fetchText(buildRawUrl(location))
      return buildSingleFilePreview(location, url, content, bytes)
    }

    if (!location.ref) {
      location.ref = await resolveDefaultBranch(location)
    }

    const rootPath = normalizePath(location.path)
    const tree = await fetchTree(location)
    const files = tree
      .filter((item) => item.type === 'blob')
      .filter((item) => {
        const itemPath = normalizePath(item.path)
        return !rootPath || itemPath === rootPath || itemPath.startsWith(`${rootPath}/`)
      })
      .filter((item) => isTextPath(item.path))

    if (files.length > MAX_FILES) {
      throw new Error(`Too many files to import (max ${MAX_FILES})`)
    }

    const skillFiles = files.filter((item) => basename(item.path) === 'SKILL.md')
    if (skillFiles.length === 0) {
      throw new Error('No SKILL.md files found under the selected GitHub tree')
    }

    const skillDirectories = skillFiles.map((item) => dirname(normalizePath(item.path)))
    const importFiles = files.filter((item) => {
      const itemPath = normalizePath(item.path)
      return skillDirectories.some(
        (skillDir) => itemPath === skillDir || itemPath.startsWith(`${skillDir}/`)
      )
    })

    const nodes = new Map<string, SkillNodeInput>()
    let totalBytes = 0
    let packName = basename(rootPath) || location.repo
    let packDescription = `${skillFiles.length} imported skills from ${location.owner}/${location.repo}`
    let packContent = ''

    for (const file of importFiles) {
      const filePath = normalizePath(file.path)
      if (file.size && file.size > MAX_FILE_BYTES) {
        throw new Error(`File ${filePath} is too large (max ${MAX_FILE_BYTES} bytes)`)
      }

      const { content, bytes } = await fetchText(buildRawUrl(location, filePath))
      totalBytes += bytes
      if (totalBytes > MAX_TOTAL_BYTES) {
        throw new Error(`Import is too large (max ${MAX_TOTAL_BYTES} bytes total)`)
      }

      const parentPath = dirname(filePath)
      if (parentPath) addFolderAncestors(nodes, parentPath)

      if (basename(filePath) === 'SKILL.md') {
        const parsed = parseSkillFrontmatter(content)
        const nodeName = parsed.name || basename(parentPath) || 'skill'
        const nodeDescription = parsed.description || `Imported from ${filePath}`

        if (!packContent) {
          packName = skillFiles.length === 1 ? nodeName : packName
          packDescription = skillFiles.length === 1 ? nodeDescription : packDescription
          packContent = parsed.content
        }

        nodes.set(filePath, {
          path: filePath,
          type: 'skill',
          name: nodeName,
          description: nodeDescription,
          content: parsed.content,
          allowedTools: parsed.allowedTools,
        })
      } else {
        nodes.set(filePath, {
          path: filePath,
          type: 'file',
          name: basename(filePath),
          description: null,
          content,
        })
      }
    }

    return {
      name: packName,
      description: packDescription,
      content: packContent,
      sourceUrl: url,
      sourceType: 'github',
      rootPath,
      nodes: sortNodes([...nodes.values()]),
      fileCount: importFiles.length,
      skillCount: skillFiles.length,
      totalBytes,
    }
  } catch (error) {
    throw toError(error)
  }
}

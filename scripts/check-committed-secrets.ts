#!/usr/bin/env bun
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { $ } from 'bun'

const ROOT = path.resolve(import.meta.dir, '..')
const POSTGRES_URL_PATTERN = /postgres(?:ql)?:\/\/[^\s'"`),]+/gi
const ALLOWED_LOCAL_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  'db',
  'postgres',
  'host.docker.internal',
])

/** Path prefixes skipped when `SECRETS_SCAN_EXCLUDE_PREFIXES` is set (comma/newline separated). */
function getExcludedPathPrefixes(): string[] {
  const raw = process.env.SECRETS_SCAN_EXCLUDE_PREFIXES
  if (!raw) return []
  return raw
    .split(/[,\n]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function isExcludedPath(file: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => file === prefix || file.startsWith(prefix))
}

interface Finding {
  file: string
  line: number
  reason: string
  snippet: string
}

async function listTrackedFiles(): Promise<string[]> {
  const output = await $`git ls-files -z`.quiet().text()
  return output.split('\0').filter(Boolean)
}

function isDynamicUrl(value: string): boolean {
  return value.includes('$') || value.includes('<') || value.includes('>')
}

function isAllowedLocalDatabaseUrl(url: URL): boolean {
  return ALLOWED_LOCAL_HOSTS.has(url.hostname)
}

function isPlaceholderDatabaseUrl(url: URL): boolean {
  const placeholderUsernames = new Set(['user', 'username', 'x'])
  const placeholderPasswords = new Set(['pass', 'password', 'your_password', 'x'])
  const placeholderHosts = new Set(['host', 'hostname', 'x'])

  return (
    placeholderUsernames.has(url.username) &&
    placeholderPasswords.has(url.password) &&
    placeholderHosts.has(url.hostname)
  )
}

function redactSnippet(snippet: string): string {
  return snippet.replace(/(postgres(?:ql)?:\/\/[^:@\s'"`]+):([^@\s'"`]+)@/gi, '$1:<redacted>@')
}

function findForbiddenDatabaseUrls(file: string, content: string): Finding[] {
  const findings: Finding[] = []
  const lines = content.split('\n')

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    POSTGRES_URL_PATTERN.lastIndex = 0

    for (const match of line.matchAll(POSTGRES_URL_PATTERN)) {
      const rawUrl = match[0]

      if (isDynamicUrl(rawUrl)) continue

      let parsed: URL
      try {
        parsed = new URL(rawUrl)
      } catch {
        continue
      }

      const hasEmbeddedCredentials = Boolean(parsed.username && parsed.password)
      const pointsToRemoteRds = parsed.hostname.endsWith('.rds.amazonaws.com')

      if (
        !hasEmbeddedCredentials ||
        isAllowedLocalDatabaseUrl(parsed) ||
        isPlaceholderDatabaseUrl(parsed)
      ) {
        continue
      }

      findings.push({
        file,
        line: index + 1,
        reason: pointsToRemoteRds
          ? 'remote RDS PostgreSQL URL with embedded credentials'
          : 'remote PostgreSQL URL with embedded credentials',
        snippet: redactSnippet(line.trim()),
      })
    }
  }

  return findings
}

async function main() {
  const files = await listTrackedFiles()
  const excludedPrefixes = getExcludedPathPrefixes()
  const findings: Finding[] = []

  for (const file of files) {
    if (isExcludedPath(file, excludedPrefixes)) continue

    const absolutePath = path.join(ROOT, file)

    let content: string
    try {
      content = await readFile(absolutePath, 'utf8')
    } catch {
      continue
    }

    findings.push(...findForbiddenDatabaseUrls(file, content))
  }

  if (findings.length === 0) {
    console.log('✅ Committed secret scan OK: no remote database credentials found')
    return
  }

  console.error('❌ Committed remote database credentials found:')
  for (const finding of findings) {
    console.error(`  ${finding.file}:${finding.line} — ${finding.reason}`)
    console.error(`    ${finding.snippet}`)
  }
  console.error(
    '\nMove DATABASE_URL values into GitHub/environment secrets and reference them via env vars.'
  )
  process.exit(1)
}

void main().catch((error) => {
  console.error('Committed secret scan failed:', error)
  process.exit(1)
})

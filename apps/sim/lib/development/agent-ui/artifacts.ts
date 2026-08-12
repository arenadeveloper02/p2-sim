import { existsSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { AgentUiPromptContext } from '@/lib/development/agent-ui/prompts'

interface GeneratedFileLike {
  path: string
  content: string
}

interface ApplyAgentUiArtifactsParams {
  outputDir: string
  outputPath: string
  spec: {
    appName: string
    description?: string
    files: GeneratedFileLike[]
  }
  context: AgentUiPromptContext
}

export interface AgentUiArtifactsResult {
  previewHtml: string
  previewPath: string
  apiWired: boolean
  hasDatabase: true
  extraFiles: number
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * Extracts the first HTTP(S) URL from a curl command.
 */
export function parseExecuteUrlFromCurl(curl: string): string | undefined {
  const match = curl.match(/https?:\/\/[^\s'"\\]+/)
  return match?.[0]
}

function buildFallbackPreviewHtml(appName: string, description?: string): string {
  const title = escapeHtml(appName || 'Agent UI')
  const body = escapeHtml(description?.trim() || 'Static preview of the generated UI.')
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} — preview</title>
</head>
<body style="margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#f8fafc;color:#0f172a;">
<main style="max-width:720px;margin:0 auto;padding:48px 24px;">
<h1 style="margin:0 0 12px;font-size:28px;">${title}</h1>
<p style="margin:0 0 24px;color:#334155;line-height:1.6;">${body}</p>
<p style="margin:0;font-size:14px;color:#64748b;">Static UI preview only. Run <code>bun dev</code> in this folder for the live self-hosted app.</p>
</main>
</body>
</html>
`
}

function buildFallbackRunRoute(executeUrl: string): string {
  return `import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const executeUrl = process.env.SIM_EXECUTE_URL ?? ${JSON.stringify(executeUrl)}
  const apiKey = process.env.SIM_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'SIM_API_KEY is not set' }, { status: 500 })
  }

  const body = await request.json().catch(() => ({}))
  const response = await fetch(executeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(body),
  })

  const data = await response.json().catch(() => ({}))
  return NextResponse.json(data, { status: response.status })
}
`
}

function buildEnvExample(executeUrl?: string): string {
  const lines = ['DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/dbname"']
  if (executeUrl) {
    lines.push(`SIM_EXECUTE_URL="${executeUrl}"`, 'SIM_API_KEY=""')
  }
  return `${lines.join('\n')}\n`
}

async function writeIfMissingOrAlways(
  outputDir: string,
  relativePath: string,
  content: string,
  overwrite: boolean
): Promise<boolean> {
  const fullPath = join(/* turbopackIgnore: true */ outputDir, relativePath)
  if (!overwrite && existsSync(fullPath)) {
    return false
  }
  await mkdir(dirname(fullPath), { recursive: true })
  await writeFile(fullPath, content, 'utf-8')
  return true
}

/**
 * Writes preview.html, env examples, and a fallback API route for Agent UI apps.
 */
export async function applyAgentUiArtifacts(
  params: ApplyAgentUiArtifactsParams
): Promise<AgentUiArtifactsResult> {
  const { outputDir, outputPath, spec, context } = params
  const curl = context.apiCurl?.trim()
  const executeUrl = curl ? parseExecuteUrlFromCurl(curl) : undefined
  const apiWired = Boolean(curl)

  const previewFromSpec = spec.files.find(
    (file) => file.path.replace(/\\/g, '/') === 'preview.html' && file.content.trim().length > 0
  )
  const previewHtml =
    previewFromSpec?.content ?? buildFallbackPreviewHtml(spec.appName, spec.description)

  let extraFiles = 0
  if (await writeIfMissingOrAlways(outputDir, 'preview.html', previewHtml, true)) {
    extraFiles += 1
  }

  const envExample = buildEnvExample(executeUrl)
  if (await writeIfMissingOrAlways(outputDir, '.env.example', envExample, true)) {
    extraFiles += 1
  }

  if (apiWired && context.apiKey?.trim()) {
    const envLines = [
      'DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/dbname"',
      executeUrl ? `SIM_EXECUTE_URL="${executeUrl}"` : undefined,
      `SIM_API_KEY="${context.apiKey.trim()}"`,
    ].filter((line): line is string => Boolean(line))
    if (await writeIfMissingOrAlways(outputDir, '.env', `${envLines.join('\n')}\n`, true)) {
      extraFiles += 1
    }
  }

  if (apiWired && executeUrl) {
    const routeRelative = join('app', 'api', 'run', 'route.ts')
    const wroteRoute = await writeIfMissingOrAlways(
      outputDir,
      routeRelative,
      buildFallbackRunRoute(executeUrl),
      false
    )
    if (wroteRoute) {
      extraFiles += 1
    }
  }

  return {
    previewHtml,
    previewPath: `${outputPath.replace(/\\/g, '/')}/preview.html`,
    apiWired,
    hasDatabase: true,
    extraFiles,
  }
}

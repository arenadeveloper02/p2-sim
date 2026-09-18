import type { AgentFrontApiEndpoint, AgentFrontCombineMode } from '@/lib/agent-front/apis'
import {
  PINNED_NEXT_VERSION,
  PINNED_REACT_VERSION,
} from '@/lib/development/normalize-generated-app-files'

export type AgentFrontUiMode = 'form' | 'chat'

/**
 * Builds .env.example (and optional .env) lines for wired APIs.
 */
export function buildAgentFrontEnvFiles(apis: AgentFrontApiEndpoint[]): {
  envExample: string
  envWithKeys: string | null
} {
  const exampleLines = [
    '# Agent Front — server-only. Never expose these to the browser.',
    ...apis.flatMap((api) => [
      `${api.envUrlKey}="${api.executeUrl}"`,
      `${api.envApiKeyKey}="your-api-key-here"`,
    ]),
    '',
  ]
  const hasAnyKey = apis.some((api) => Boolean(api.apiKey))
  if (!hasAnyKey) {
    return { envExample: exampleLines.join('\n'), envWithKeys: null }
  }
  const envLines = [
    '# Agent Front — generated with provided keys. Do not commit.',
    ...apis.flatMap((api) => [
      `${api.envUrlKey}="${api.executeUrl}"`,
      `${api.envApiKeyKey}="${api.apiKey ?? ''}"`,
    ]),
    '',
  ]
  return { envExample: exampleLines.join('\n'), envWithKeys: envLines.join('\n') }
}

/**
 * Deterministic multi-API orchestration route for the generated app.
 */
export function buildAgentFrontRunRoute(
  apis: AgentFrontApiEndpoint[],
  combineMode: AgentFrontCombineMode
): string {
  const apiLiterals = apis
    .map(
      (api) =>
        `  { name: ${JSON.stringify(api.name)}, slug: ${JSON.stringify(api.slug)}, envUrl: ${JSON.stringify(api.envUrlKey)}, envKey: ${JSON.stringify(api.envApiKeyKey)} },`
    )
    .join('\n')

  return `import { NextResponse } from 'next/server'

const APIS = [
${apiLiterals}
] as const

type CombineMode = 'parallel' | 'sequence' | 'prompt'
const COMBINE_MODE = ${JSON.stringify(combineMode)} as CombineMode

async function callApi(
  api: (typeof APIS)[number],
  body: unknown
): Promise<{ name: string; slug: string; ok: boolean; status: number; data: unknown }> {
  const executeUrl = process.env[api.envUrl]
  const apiKey = process.env[api.envKey]
  if (!executeUrl) {
    return {
      name: api.name,
      slug: api.slug,
      ok: false,
      status: 500,
      data: { error: \`\${api.envUrl} is not set\` },
    }
  }
  if (!apiKey) {
    return {
      name: api.name,
      slug: api.slug,
      ok: false,
      status: 500,
      data: { error: \`\${api.envKey} is not set\` },
    }
  }

  const response = await fetch(executeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify(body ?? {}),
  })

  const text = await response.text()
  let data: unknown = text
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    // keep raw text
  }

  return {
    name: api.name,
    slug: api.slug,
    ok: response.ok,
    status: response.status,
    data,
  }
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))

  if (COMBINE_MODE === 'sequence') {
    let payload: unknown = body
    const steps: Array<{ name: string; slug: string; ok: boolean; status: number; data: unknown }> =
      []
    for (const api of APIS) {
      const result = await callApi(api, payload)
      steps.push(result)
      if (!result.ok) {
        return NextResponse.json(
          { combineMode: COMBINE_MODE, steps, error: \`\${api.name} failed\` },
          { status: 502 }
        )
      }
      payload = result.data
    }
    return NextResponse.json({ combineMode: COMBINE_MODE, steps, result: payload })
  }

  const settled = await Promise.all(APIS.map((api) => callApi(api, body)))
  const bySlug = Object.fromEntries(settled.map((item) => [item.slug, item]))
  const allOk = settled.every((item) => item.ok)
  return NextResponse.json(
    { combineMode: COMBINE_MODE, results: bySlug, apis: settled },
    { status: allOk ? 200 : 502 }
  )
}
`
}

/**
 * Fallback preview when the model does not return preview HTML.
 */
export function buildFallbackPreviewHtml(appName: string, description: string): string {
  const title = escapeHtml(appName || 'Agent Front')
  const body = escapeHtml(description || 'Static preview of the generated UI.')
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * Deterministic project scaffold files (excluding LLM-generated page + preview).
 */
export function buildAgentFrontScaffoldFiles(params: {
  appName: string
  description: string
  uiMode: AgentFrontUiMode
  combineMode: AgentFrontCombineMode
  apis: AgentFrontApiEndpoint[]
  repoName: string
}): Array<{ path: string; content: string }> {
  const { appName, description, uiMode, combineMode, apis, repoName } = params
  const { envExample, envWithKeys } = buildAgentFrontEnvFiles(apis)
  const apiSummary = apis.map((api) => `- ${api.name} (${api.slug})`).join('\n')

  const files: Array<{ path: string; content: string }> = [
    {
      path: 'package.json',
      content: `${JSON.stringify(
        {
          name: repoName,
          version: '0.1.0',
          private: true,
          scripts: {
            dev: 'next dev',
            build: 'next build',
            start: 'next start',
          },
          dependencies: {
            next: PINNED_NEXT_VERSION,
            react: PINNED_REACT_VERSION,
            'react-dom': PINNED_REACT_VERSION,
          },
          devDependencies: {
            '@types/node': '^22',
            '@types/react': '^19',
            '@types/react-dom': '^19',
            typescript: '^5',
          },
        },
        null,
        2
      )}\n`,
    },
    {
      path: 'tsconfig.json',
      content: `${JSON.stringify(
        {
          compilerOptions: {
            target: 'ES2017',
            lib: ['dom', 'dom.iterable', 'esnext'],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            noEmit: true,
            esModuleInterop: true,
            module: 'esnext',
            moduleResolution: 'bundler',
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: 'preserve',
            incremental: true,
            plugins: [{ name: 'next' }],
            paths: { '@/*': ['./*'] },
          },
          include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
          exclude: ['node_modules'],
        },
        null,
        2
      )}\n`,
    },
    {
      path: 'next.config.ts',
      content: `import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
}

export default nextConfig
`,
    },
    {
      path: 'next-env.d.ts',
      content: `/// <reference types="next" />
/// <reference types="next/image-types/global" />
`,
    },
    {
      path: '.gitignore',
      content: `node_modules
.next
.env
.env.local
*.log
`,
    },
    {
      path: '.env.example',
      content: envExample,
    },
    {
      path: '.agent-front.json',
      content: `${JSON.stringify(
        {
          kind: 'agent_front',
          appName,
          uiMode,
          combineMode,
          apis: apis.map((api) => ({ name: api.name, slug: api.slug })),
        },
        null,
        2
      )}\n`,
    },
    {
      path: 'README.md',
      content: `# ${appName}

${description}

## UI mode

\`${uiMode}\` · combine: \`${combineMode}\`

## Wired APIs

${apiSummary}

## Run locally

\`\`\`bash
bun install
cp .env.example .env   # fill API keys if not already generated
bun dev
\`\`\`

Open http://localhost:3000

Submit/Send calls \`POST /api/run\`, which proxies to your workflow APIs using server-side keys.
`,
    },
    {
      path: 'app/layout.tsx',
      content: `import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: ${JSON.stringify(appName)},
  description: ${JSON.stringify(description)},
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'ui-sans-serif, system-ui, sans-serif' }}>{children}</body>
    </html>
  )
}
`,
    },
    {
      path: 'app/api/run/route.ts',
      content: buildAgentFrontRunRoute(apis, combineMode),
    },
  ]

  if (envWithKeys) {
    files.push({ path: '.env', content: envWithKeys })
  }

  return files
}

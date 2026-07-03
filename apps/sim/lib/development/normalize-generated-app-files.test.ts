/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  buildRepoSummaryContent,
  collectJsxPropNamesForComponent,
  extractJsxAttributeNames,
  ensureReadmeFile,
  ensureRepoSummaryFile,
  GENERATED_APP_REPO_SUMMARY_PATH,
  PINNED_NEXT_VERSION,
  PINNED_REACT_VERSION,
  ensureNextEnvFile,
  inferComponentPropTypes,
  normalizeGeneratedAppFiles,
  patchNextConfigContent,
  patchPackageJsonContent,
  reconcileSplitImportStatements,
  removeConflictingModuleStubs,
  sanitizeComponentFileImports,
  stripExternalGoogleFontReferences,
  hasOrphanImportBlock,
} from '@/lib/development/normalize-generated-app-files'

describe('normalize-generated-app-files', () => {
  it('removes eslint from next.config for Next.js 16', () => {
    const config = `import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { remotePatterns: [] },
}

export default nextConfig
`
    const result = patchNextConfigContent(config)
    expect(result).not.toContain('eslint')
    expect(result).not.toContain('ignoreDuringBuilds')
    expect(result).toContain('images')
  })

  it('strips Google Fonts @import from CSS', () => {
    const css = `@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600&display=swap');
body { margin: 0; }
`
    const result = stripExternalGoogleFontReferences(css)
    expect(result).not.toContain('fonts.googleapis.com')
    expect(result).toContain('body { margin: 0; }')
  })

  it('infers prop types from lib/actions return types', () => {
    const files = [
      {
        path: 'lib/actions.ts',
        content:
          'export interface AnalyticsData { total: number }\nexport async function getAnalytics(): Promise<AnalyticsData> { return { total: 0 } }\n',
      },
      {
        path: 'app/analytics/page.tsx',
        content:
          "import AnalyticsClient from '@/components/AnalyticsClient'\nexport default async function Page() { const data = await getAnalytics(); return <AnalyticsClient data={data} /> }\n",
      },
    ]

    const propTypes = inferComponentPropTypes('AnalyticsClient', ['data'], files)
    expect(propTypes.data).toBe('AnalyticsData')
  })

  it('detects JSX children usage as a children prop', () => {
    const files = [
      {
        path: 'app/layout.tsx',
        content:
          "import Providers from '@/components/Providers'\nexport default function Layout({ children }: { children: React.ReactNode }) {\n  return <Providers><html><body>{children}</body></html></Providers>\n}\n",
      },
    ]

    expect(collectJsxPropNamesForComponent('Providers', files)).toEqual(['children'])
  })

  it('does not treat words inside quoted attribute values as prop names', () => {
    const attrs =
      ' message="Are you sure you want to delete all selected tasks? This action cannot be undone" onConfirm={handleDelete} open onClose={handleClose} '
    expect(extractJsxAttributeNames(attrs)).toEqual(['message', 'onConfirm', 'open', 'onClose'])
  })

  it('collects only real prop names when pages pass long confirmation copy', () => {
    const files = [
      {
        path: 'app/tasks/page.tsx',
        content: `import ConfirmModal from '@/components/ConfirmModal'
export default function Page() {
  return (
    <ConfirmModal
      message="Are you sure you want to delete all selected tasks? This action cannot be undone and you will lose your data permanently"
      onConfirm={() => {}}
      open
      onClose={() => {}}
    />
  )
}
`,
      },
    ]

    expect(collectJsxPropNamesForComponent('ConfirmModal', files)).toEqual([
      'message',
      'onClose',
      'onConfirm',
      'open',
    ])
  })

  it('sanitizes duplicate ReactNode imports from react and lib/actions', () => {
    const sanitized = sanitizeComponentFileImports(`'use client'

import type { ReactNode } from 'react'
import type { ReactNode } from '@/lib/actions'

interface AppProvidersProps {
  children: ReactNode
}

export default function AppProviders({ children }: AppProvidersProps) {
  return <>{children}</>
}
`)

    expect(sanitized.match(/import type \{ ReactNode \} from 'react'/g)?.length).toBe(1)
    expect(sanitized).not.toContain("from '@/lib/actions'")
  })

  it('sanitizes duplicate ReactNode imports added by LLM repair rounds', () => {
    const sanitized = sanitizeComponentFileImports(`'use client'

import type { ReactNode } from 'react'
import type { ReactNode } from 'react'

export default function AppProviders({ children }: { children: ReactNode }) {
  return <>{children}</>
}
`)

    expect(sanitized.match(/ReactNode/g)?.length).toBeGreaterThan(0)
    expect(sanitized.match(/import type \{ ReactNode \} from 'react'/g)?.length).toBe(1)
  })

  it('sanitizeComponentFileImports dedupes duplicate ReactNode imports', () => {
    const content =
      "'use client'\n\nimport type { ReactNode } from 'react'\nimport type { ReactNode } from '@/lib/actions'\n\nexport default function AppProviders({ children }: { children: ReactNode }) {\n  return <>{children}</>\n}\n"
    const sanitized = sanitizeComponentFileImports(content)
    expect(sanitized.match(/import type \{ ReactNode \} from 'react'/g)?.length).toBe(1)
    expect(sanitized).not.toContain("from '@/lib/actions'")
  })

  it('removes conflicting lib/actions.tsx stubs when actions.ts exists', () => {
    const files = removeConflictingModuleStubs([
      {
        path: 'lib/actions.ts',
        content: "export async function getTasks() { return [] }\n",
      },
      {
        path: 'lib/actions.tsx',
        content:
          '/** Auto-generated stub so @/ imports resolve on Vercel. */\nexport default function Actions() { return <div /> }\n',
      },
    ])

    expect(files.some((file) => file.path === 'lib/actions.ts')).toBe(true)
    expect(files.some((file) => file.path === 'lib/actions.tsx')).toBe(false)
  })

  it('repairs split imports where a second package specifiers follow the first import close', () => {
    const broken = `"use client";

import {
  CheckSquare,
  BarChart2,
} from 'lucide-react';
  BarChart,
  Bar,
  XAxis,
} from 'recharts';

export default function DashboardClient() { return null }
`
    const fixed = reconcileSplitImportStatements(broken)
    expect(fixed).toContain("} from 'lucide-react';")
    expect(fixed).toContain("import {\nBarChart,")
    expect(fixed).toContain("} from 'recharts';")
    expect(fixed).not.toMatch(/\} from 'lucide-react';\s*\n\s*BarChart,/)
  })

  it('repairs orphan specifiers after a complete import when the last specifier has no trailing comma', () => {
    const broken = `import {
  BarChart,
  Bar,
} from 'recharts';
  CheckCircle,
  Clock,
  Tag
} from 'lucide-react';
`
    const fixed = reconcileSplitImportStatements(broken)
    expect(fixed).toContain("import {\nCheckCircle,")
    expect(fixed).toContain("} from 'lucide-react';")
    expect(fixed).not.toMatch(/\} from 'recharts';\s*\n\s*CheckCircle,/)
  })

  it('does not auto-repair split imports during normalizeGeneratedAppFiles', () => {
    const brokenDashboard = `"use client";

import {
useState
} from 'react';
BarChart,
  Bar,
} from 'recharts';
CheckCircle,
  Clock,
} from 'lucide-react';
import type { TaskData } from '@/lib/types';

export default function DashboardClient() { return null }
`
    const files = normalizeGeneratedAppFiles(
      [
        { path: 'components/DashboardClient.tsx', content: brokenDashboard },
        { path: 'package.json', content: JSON.stringify({ name: 'demo-app' }) },
        { path: 'app/layout.tsx', content: 'export default function Layout() { return null }' },
        { path: 'app/page.tsx', content: 'export default function Page() { return null }' },
      ],
      { appName: 'Demo App', repoName: 'demo-app', requiresDatabase: true }
    )

    const dashboard = files.find((file) => file.path === 'components/DashboardClient.tsx')
    expect(hasOrphanImportBlock(dashboard?.content ?? '')).toBe(true)
  })

  it('adds jsonwebtoken via patchPackageJsonContent when database is required', () => {
    const patched = patchPackageJsonContent(JSON.stringify({ name: 'demo-app' }), {
      requiresDatabase: true,
    })
    expect(patched).toContain('jsonwebtoken')
    expect(patched).toContain('@types/jsonwebtoken')
  })

  it('scaffolds README.md when missing', () => {
    const files = ensureReadmeFile(
      [
        { path: 'package.json', content: JSON.stringify({ name: 'leadership-todo' }) },
        { path: 'app/page.tsx', content: 'export default function Page() { return null }' },
        { path: 'app/dashboard/page.tsx', content: 'export default function Page() { return null }' },
      ],
      {
        appName: 'Leadership To Do List',
        description: 'Track leadership tasks and priorities.',
        features: ['Task dashboard', 'Analytics'],
        requiresDatabase: true,
      }
    )

    const readme = files.find((file) => file.path === 'README.md')
    expect(readme).toBeDefined()
    expect(readme?.content).toContain('# Leadership To Do List')
    expect(readme?.content).toContain('Task dashboard')
    expect(readme?.content).toContain('`/dashboard`')
    expect(readme?.content).toContain('DATABASE_URL')
    expect(readme?.content).toContain('npm run dev')
  })

  it('replaces minimal README.md with full documentation', () => {
    const files = ensureReadmeFile(
      [{ path: 'README.md', content: '# Demo\n' }],
      { appName: 'Demo App', description: 'A demo application.' }
    )

    const readme = files.find((file) => file.path === 'README.md')
    expect(readme?.content).toContain('## Getting Started')
    expect(readme?.content).toContain('## Tech Stack')
  })

  it('scaffolds REPO_SUMMARY.md when missing', () => {
    const files = ensureRepoSummaryFile(
      [
        { path: 'package.json', content: JSON.stringify({ name: 'taskmaster' }) },
        { path: 'app/page.tsx', content: 'export default function Page() { return null }' },
        { path: 'app/dashboard/page.tsx', content: 'export default function Page() { return null }' },
        { path: 'prisma/schema.prisma', content: 'model Task { id String @id }' },
      ],
      {
        appName: 'Taskmaster',
        description: 'Team task management app.',
        features: ['Dashboard', 'Tasks'],
        repoName: 'taskmaster',
        requiresDatabase: true,
        latestUserRequest: 'Add a settings page',
      }
    )

    const summary = files.find((file) => file.path === GENERATED_APP_REPO_SUMMARY_PATH)
    expect(summary).toBeDefined()
    expect(summary?.content).toContain('# Repository Summary: Taskmaster')
    expect(summary?.content).toContain('`/dashboard`')
    expect(summary?.content).toContain('`Task`')
    expect(summary?.content).toContain('Add a settings page')
    expect(summary?.content).toContain('## File Inventory')
  })

  it('includes REPO_SUMMARY.md after normalizeGeneratedAppFiles', () => {
    const files = normalizeGeneratedAppFiles(
      [
        { path: 'package.json', content: JSON.stringify({ name: 'demo-app' }) },
        { path: 'app/layout.tsx', content: 'export default function Layout() { return null }' },
        { path: 'app/page.tsx', content: 'export default function Page() { return null }' },
      ],
      { appName: 'Demo App', description: 'Demo', repoName: 'demo-app', requiresDatabase: true }
    )

    expect(files.some((file) => file.path === GENERATED_APP_REPO_SUMMARY_PATH)).toBe(true)
    expect(buildRepoSummaryContent(files, { appName: 'Demo App' })).toContain('Demo App')
  })

  it('scaffolds next-env.d.ts for JSX type resolution', () => {
    const files = ensureNextEnvFile([{ path: 'package.json', content: '{}' }])
    expect(files.some((file) => file.path === 'next-env.d.ts')).toBe(true)
    expect(files.find((file) => file.path === 'next-env.d.ts')?.content).toContain(
      'reference types="next"'
    )
  })

  it('does not auto-inject force-dynamic on database-backed pages', () => {
    const pageContent =
      "import { getAnalytics } from '@/lib/actions'\nexport const metadata = { title: 'Analytics' }\nexport default async function Page() { await getAnalytics(); return null }\n"
    const files = normalizeGeneratedAppFiles(
      [
        { path: 'app/analytics/page.tsx', content: pageContent },
        { path: 'package.json', content: JSON.stringify({ name: 'demo' }) },
        { path: 'app/layout.tsx', content: 'export default function Layout() { return null }' },
        { path: 'app/page.tsx', content: 'export default function Page() { return null }' },
      ],
      { requiresDatabase: true, appName: 'Demo', repoName: 'demo' }
    )

    const page = files.find((file) => file.path === 'app/analytics/page.tsx')
    expect(page?.content).not.toContain("export const dynamic = 'force-dynamic'")
  })

  it('pins latest Next.js and React versions in package.json', () => {
    const patched = patchPackageJsonContent(
      JSON.stringify({
        name: 'demo',
        dependencies: { next: '15.0.0', react: '18.0.0' },
        devDependencies: {},
      })
    )
    const pkg = JSON.parse(patched) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(pkg.dependencies.next).toBe(PINNED_NEXT_VERSION)
    expect(pkg.dependencies.react).toBe(PINNED_REACT_VERSION)
    expect(pkg.dependencies['react-dom']).toBe(PINNED_REACT_VERSION)
    expect(pkg.devDependencies['eslint-config-next']).toBe(PINNED_NEXT_VERSION)
  })

  it('overrides lucide-react to a React 19 compatible version when present', () => {
    const patched = patchPackageJsonContent(
      JSON.stringify({
        name: 'demo',
        dependencies: { 'lucide-react': '^0.395.0' },
      })
    )
    const pkg = JSON.parse(patched) as { dependencies: Record<string, string> }
    expect(pkg.dependencies['lucide-react']).toBe('^0.479.0')
  })

  it('adds lucide-react when imported in source but omitted from package.json', () => {
    const files = normalizeGeneratedAppFiles(
      [
        {
          path: 'package.json',
          content: JSON.stringify({ name: 'demo', dependencies: {}, devDependencies: {} }),
        },
        {
          path: 'components/Icon.tsx',
          content: "import { Check } from 'lucide-react'\nexport default function Icon() { return <Check /> }\n",
        },
      ],
      { requiresDatabase: false, appName: 'demo', description: 'demo', features: [], repoName: 'demo' }
    )
    const pkg = JSON.parse(files.find((file) => file.path === 'package.json')?.content ?? '{}') as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies['lucide-react']).toBe('^0.479.0')
  })

  it('adds openai when imported in source but omitted from package.json', () => {
    const files = normalizeGeneratedAppFiles(
      [
        {
          path: 'package.json',
          content: JSON.stringify({ name: 'demo', dependencies: {}, devDependencies: {} }),
        },
        {
          path: 'app/api/agents/run/route.ts',
          content: "import OpenAI from 'openai'\nexport async function POST() { return Response.json({ ok: true }) }\n",
        },
      ],
      { requiresDatabase: true, appName: 'demo', description: 'demo', features: [], repoName: 'demo' }
    )
    const pkg = JSON.parse(files.find((file) => file.path === 'package.json')?.content ?? '{}') as {
      dependencies: Record<string, string>
    }
    expect(pkg.dependencies.openai).toBe('^4.91.1')
  })

  it('adds Prisma deps and build scripts when database is required', () => {
    const patched = patchPackageJsonContent(
      JSON.stringify({
        name: 'demo',
        scripts: { build: 'next build', postinstall: 'prisma generate' },
      }),
      { requiresDatabase: true }
    )
    const pkg = JSON.parse(patched) as {
      dependencies: Record<string, string>
      devDependencies: Record<string, string>
      scripts: Record<string, string>
    }
    expect(pkg.dependencies['@prisma/client']).toBeDefined()
    expect(pkg.dependencies.jsonwebtoken).toBeDefined()
    expect(pkg.devDependencies.prisma).toBeDefined()
    expect(pkg.devDependencies['@types/jsonwebtoken']).toBeDefined()
    expect(pkg.scripts.postinstall).toBeUndefined()
    expect(pkg.scripts.build).toContain('prisma generate')
    expect(pkg.scripts.build).toContain('prisma db push')
    expect(pkg.scripts.build).toContain('prisma db seed')
    expect(pkg.scripts.build).toContain('db/seed.sql')
  })

  it('does not inject Prisma schema or client during normalize', () => {
    const files = normalizeGeneratedAppFiles(
      [{ path: 'package.json', content: JSON.stringify({ name: 'demo' }) }],
      { requiresDatabase: true, appName: 'Demo', repoName: 'demo' }
    )
    expect(files.some((file) => file.path === 'prisma/schema.prisma')).toBe(false)
    expect(files.some((file) => file.path === 'lib/prisma.ts')).toBe(false)
  })

  it('auto-adds missing lib/actions exports like updatePassword during normalize', () => {
    const files = normalizeGeneratedAppFiles(
      [
        {
          path: 'package.json',
          content: JSON.stringify({ name: 'demo', scripts: { build: 'next build' } }),
        },
        { path: 'tsconfig.json', content: '{"compilerOptions":{"paths":{"@/*":["./*"]}}}' },
        { path: 'lib/actions.ts', content: 'export async function getUser() { return null }\n' },
        {
          path: 'app/api/auth/update-password/route.ts',
          content:
            "import { updatePassword } from '@/lib/actions'\nexport async function POST() { await updatePassword('id', 'pass'); return Response.json({ ok: true }) }\n",
        },
      ],
      { requiresDatabase: true }
    )

    const actions = files.find((file) => file.path === 'lib/actions.ts')
    expect(actions?.content).toContain('export async function updatePassword')
  })
})

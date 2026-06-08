/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  collectJsxPropNamesForComponent,
  ensureReadmeFile,
  PINNED_NEXT_VERSION,
  PINNED_REACT_VERSION,
  ensureDatabaseScaffold,
  ensureNextEnvFile,
  inferComponentPropTypes,
  normalizeGeneratedAppFiles,
  patchNextConfigContent,
  patchPackageJsonContent,
  patchPrismaSchemaContent,
  dedupeActionsTypeConflicts,
  reconcileActionsTypeExports,
  reconcileClientComponentProps,
  reconcileComponentExportStyles,
  reconcileMissingAliasImports,
  reconcilePrismaRelationIncludes,
  reconcileTypesExports,
  removeConflictingModuleStubs,
  sanitizeComponentFileImports,
  stripExternalGoogleFontReferences,
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

  it('adds stub files for missing @/ component imports', () => {
    const files = reconcileMissingAliasImports([
      {
        path: 'app/layout.tsx',
        content: "import Footer from '@/components/Footer'\nexport default function Layout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html> }\n",
      },
      { path: 'components/Navbar.tsx', content: 'export default function Navbar() { return null }' },
    ])

    expect(files.some((f) => f.path === 'components/Footer.tsx')).toBe(true)
  })

  it('adds stub props inferred from JSX usage so TypeScript build passes', () => {
    const files = reconcileMissingAliasImports([
      {
        path: 'app/analytics/page.tsx',
        content:
          "import AnalyticsClient from '@/components/AnalyticsClient'\nexport default async function Page() { const data = {}; return <AnalyticsClient data={data} /> }\n",
      },
    ])

    const stub = files.find((file) => file.path === 'components/AnalyticsClient.tsx')
    expect(stub).toBeDefined()
    expect(stub?.content).toContain('interface AnalyticsClientProps')
    expect(stub?.content).toContain('data: unknown')
    expect(stub?.content).toContain('data: _data')
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

  it('patches components that omit children used in layout', () => {
    const files = reconcileClientComponentProps([
      {
        path: 'app/layout.tsx',
        content:
          "import Providers from '@/components/Providers'\nexport default function Layout({ children }: { children: React.ReactNode }) {\n  return <Providers><html><body>{children}</body></html></Providers>\n}\n",
      },
      {
        path: 'components/Providers.tsx',
        content:
          "'use client'\n\nexport default function Providers() {\n  return <div>Providers</div>\n}\n",
      },
    ])

    const providers = files.find((file) => file.path === 'components/Providers.tsx')
    expect(providers?.content).toContain('interface ProvidersProps')
    expect(providers?.content).toContain('children: ReactNode')
    expect(providers?.content).toContain('import type { ReactNode }')
  })

  it('does not duplicate ReactNode when the component already imports it from react', () => {
    const files = reconcileClientComponentProps([
      {
        path: 'app/layout.tsx',
        content:
          "import AppProviders from '@/components/layout/AppProviders'\nexport default function Layout({ children }: { children: React.ReactNode }) {\n  return <AppProviders>{children}</AppProviders>\n}\n",
      },
      {
        path: 'components/layout/AppProviders.tsx',
        content:
          "'use client'\n\nimport type { ReactNode } from 'react'\n\nexport default function AppProviders() {\n  return <div>AppProviders</div>\n}\n",
      },
    ])

    const providers = files.find((file) => file.path === 'components/layout/AppProviders.tsx')
    expect(providers?.content.match(/import type \{ ReactNode \} from 'react'/g)?.length).toBe(1)
    expect(providers?.content).not.toContain("from '@/lib/actions'")
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

  it('normalizes duplicate ReactNode imports in AppProviders through the full pipeline', () => {
    const files = normalizeGeneratedAppFiles([
      {
        path: 'app/layout.tsx',
        content:
          "import AppProviders from '@/components/layout/AppProviders'\nexport default function RootLayout({ children }: { children: React.ReactNode }) {\n  return <html><body><AppProviders>{children}</AppProviders></body></html>\n}\n",
      },
      {
        path: 'components/layout/AppProviders.tsx',
        content:
          "'use client'\n\nimport type { ReactNode } from 'react'\nimport type { ReactNode } from '@/lib/actions'\n\nexport default function AppProviders({ children }: { children: ReactNode }) {\n  return <>{children}</>\n}\n",
      },
      {
        path: 'package.json',
        content: JSON.stringify({ name: 'test', scripts: { build: 'next build' } }),
      },
      {
        path: 'tsconfig.json',
        content: JSON.stringify({ compilerOptions: { jsx: 'preserve' }, include: ['**/*'] }),
      },
    ])

    const providers = files.find((file) => file.path === 'components/layout/AppProviders.tsx')
    expect(providers?.content.match(/import type \{ ReactNode \} from 'react'/g)?.length).toBe(1)
    expect(providers?.content).not.toContain("from '@/lib/actions'")
  })

  it('patches existing Client components that omit props used by pages', () => {
    const files = reconcileClientComponentProps([
      {
        path: 'lib/actions.ts',
        content:
          'export interface AnalyticsData { total: number }\nexport async function getAnalytics(): Promise<AnalyticsData> { return { total: 0 } }\n',
      },
      {
        path: 'app/analytics/page.tsx',
        content:
          "import { getAnalytics } from '@/lib/actions'\nimport AnalyticsClient from '@/components/AnalyticsClient'\nexport default async function Page() { const data = await getAnalytics(); return <AnalyticsClient data={data} /> }\n",
      },
      {
        path: 'components/AnalyticsClient.tsx',
        content:
          'export default function AnalyticsClient() {\n  return <div>Analytics</div>\n}\n',
      },
    ])

    const client = files.find((file) => file.path === 'components/AnalyticsClient.tsx')
    expect(client?.content).toContain('interface AnalyticsClientProps')
    expect(client?.content).toContain('data: AnalyticsData')
    expect(client?.content).toContain('import type { AnalyticsData }')
    expect(client?.content).toContain('data: _data')
  })

  it('creates lib/actions.ts stubs instead of lib/actions.tsx component stubs', () => {
    const files = reconcileMissingAliasImports([
      {
        path: 'app/page.tsx',
        content:
          "import { getTasks } from '@/lib/actions'\nexport default async function Page() { await getTasks(); return null }\n",
      },
    ])

    expect(files.some((file) => file.path === 'lib/actions.ts')).toBe(true)
    expect(files.some((file) => file.path === 'lib/actions.tsx')).toBe(false)
    const actions = files.find((file) => file.path === 'lib/actions.ts')
    expect(actions?.content).toContain("'use server'")
    expect(actions?.content).not.toContain('<section')
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

  it('adds missing type exports to lib/actions.ts', () => {
    const files = reconcileActionsTypeExports([
      {
        path: 'lib/actions.ts',
        content: "export async function getTasks() { return [] }\n",
      },
      {
        path: 'components/TasksClient.tsx',
        content:
          "import type { TaskWithOwners, Member } from '@/lib/actions'\nexport default function TasksClient() { return null }\n",
      },
    ])

    const actions = files.find((file) => file.path === 'lib/actions.ts')
    expect(actions?.content).toContain('export interface TaskWithOwners')
    expect(actions?.content).toContain('export interface Member')
  })

  it('does not add duplicate lib/actions types already re-exported from lib/types', () => {
    const files = dedupeActionsTypeConflicts(
      reconcileActionsTypeExports([
        {
          path: 'lib/types.ts',
          content: 'export interface AnalyticsData { totalTasks: number }\n',
        },
        {
          path: 'lib/actions.ts',
          content:
            "import type { AnalyticsData } from '@/lib/types'\nexport type { AnalyticsData }\nexport async function getAnalytics(): Promise<AnalyticsData> { return { totalTasks: 0 } }\n",
        },
        {
          path: 'components/AnalyticsClient.tsx',
          content:
            "import type { AnalyticsData } from '@/lib/actions'\nexport default function AnalyticsClient({ analytics }: { analytics: AnalyticsData }) { return null }\n",
        },
      ])
    )

    const actions = files.find((file) => file.path === 'lib/actions.ts')
    expect(actions?.content).not.toContain('export interface AnalyticsData')
    expect(actions?.content).not.toContain('Auto-added exports')
    expect(actions?.content.match(/export interface AnalyticsData/g)).toBeNull()
  })

  it('adds missing type exports to lib/types.ts', () => {
    const files = reconcileTypesExports([
      {
        path: 'lib/types.ts',
        content: 'export interface Task { id: string; title: string }\nexport interface Member { id: string; name: string }\n',
      },
      {
        path: 'app/dashboard/page.tsx',
        content:
          "import type { TaskWithRelations, MemberData } from '@/lib/types'\nexport default function Page() { return null }\n",
      },
    ])

    const types = files.find((file) => file.path === 'lib/types.ts')
    expect(types?.content).toContain('export type TaskWithRelations = Task')
    expect(types?.content).toContain('export type MemberData = Member')
  })

  it('adds named exports for shadcn-style component imports', () => {
    const files = reconcileComponentExportStyles([
      {
        path: 'app/layout.tsx',
        content: "import { Toaster } from '@/components/ui/toaster'\nexport default function Layout() { return <Toaster /> }\n",
      },
      {
        path: 'components/ui/toaster.tsx',
        content:
          '/** Auto-generated stub */\nexport default function toaster() {\n  return null\n}\n',
      },
    ])

    const toaster = files.find((file) => file.path === 'components/ui/toaster.tsx')
    expect(toaster?.content).toContain("'use client'")
    expect(toaster?.content).toContain('export default function Toaster')
    expect(toaster?.content).toContain('export { Toaster }')
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

  it('scaffolds lib/types.ts when imports exist but file is missing', () => {
    const files = reconcileTypesExports([
      {
        path: 'components/TaskCard.tsx',
        content: "import type { TaskWithRelations } from '@/lib/types'\nexport default function TaskCard() { return null }\n",
      },
    ])

    expect(files.some((file) => file.path === 'lib/types.ts')).toBe(true)
    expect(files.find((file) => file.path === 'lib/types.ts')?.content).toContain(
      'export interface TaskWithRelations'
    )
  })

  it('fixes Prisma include aliases that do not match schema relation names', () => {
    const schema = `model Comment {
  id String @id
  taskId String
  comment String
  createdBy String
  task Task @relation(fields: [taskId], references: [id])
  user User @relation(fields: [createdBy], references: [id])
}
`
    const files = reconcilePrismaRelationIncludes([
      { path: 'prisma/schema.prisma', content: schema },
      {
        path: 'app/dashboard/page.tsx',
        content:
          'const tasks = await prisma.task.findMany({ include: { comments: { include: { author: true } } } })\ncomments: t.comments.map((c) => ({ id: c.id, author: { id: c.author.id, name: c.author.name } }))',
      },
    ])

    const page = files.find((file) => file.path === 'app/dashboard/page.tsx')
    expect(page?.content).toContain('include: { user: true }')
    expect(page?.content).toContain('c.user.id')
    expect(page?.content).toContain('user: { id:')
    expect(page?.content).not.toContain('author: true')
  })

  it('scaffolds next-env.d.ts for JSX type resolution', () => {
    const files = ensureNextEnvFile([{ path: 'package.json', content: '{}' }])
    expect(files.some((file) => file.path === 'next-env.d.ts')).toBe(true)
    expect(files.find((file) => file.path === 'next-env.d.ts')?.content).toContain(
      'reference types="next"'
    )
  })

  it('marks database-backed pages as force-dynamic', () => {
    const files = normalizeGeneratedAppFiles(
      [
        {
          path: 'app/analytics/page.tsx',
          content:
            "import { getAnalytics } from '@/lib/actions'\nexport const metadata = { title: 'Analytics' }\nexport default async function Page() { await getAnalytics(); return null }\n",
        },
        { path: 'package.json', content: JSON.stringify({ name: 'demo' }) },
      ],
      { requiresDatabase: true }
    )

    const page = files.find((file) => file.path === 'app/analytics/page.tsx')
    expect(page?.content).toContain("export const dynamic = 'force-dynamic'")
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
    expect(pkg.devDependencies.prisma).toBeDefined()
    expect(pkg.scripts.postinstall).toBeUndefined()
    expect(pkg.scripts.build).toContain('prisma generate')
    expect(pkg.scripts.build).toContain('prisma db push')
  })

  it('removes Prisma directUrl so only DATABASE_URL is required on Vercel', () => {
    const schema = `datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DATABASE_URL_UNPOOLED")
}
`
    const result = patchPrismaSchemaContent(schema)
    expect(result).toContain('env("DATABASE_URL")')
    expect(result).not.toContain('directUrl')
    expect(result).not.toContain('DATABASE_URL_UNPOOLED')
  })

  it('scaffolds Prisma files when database is required', () => {
    const files = ensureDatabaseScaffold(
      [{ path: 'package.json', content: '{}' }],
      { requiresDatabase: true }
    )
    const schema = files.find((file) => file.path === 'prisma/schema.prisma')
    expect(schema).toBeDefined()
    expect(schema?.content).toContain('env("DATABASE_URL")')
    expect(schema?.content).not.toContain('directUrl')
    expect(files.some((file) => file.path === 'lib/prisma.ts')).toBe(true)
  })

  it('does not scaffold Prisma files for static apps', () => {
    const files = normalizeGeneratedAppFiles(
      [{ path: 'package.json', content: JSON.stringify({ name: 'demo' }) }],
      { requiresDatabase: false }
    )
    expect(files.some((file) => file.path === 'prisma/schema.prisma')).toBe(false)
  })
})

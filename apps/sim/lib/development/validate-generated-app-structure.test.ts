/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  formatStructureValidationIssues,
  validateGeneratedAppStructure,
} from '@/lib/development/validate-generated-app-structure'

describe('validate-generated-app-structure', () => {
  const baseFiles = [
    {
      path: 'package.json',
      content: JSON.stringify({
        name: 'demo',
        scripts: { build: 'next build', dev: 'next dev' },
        dependencies: { next: '16.0.0', react: '19.0.0' },
      }),
    },
    { path: 'tailwind.config.ts', content: 'export default {}' },
    { path: 'postcss.config.mjs', content: 'export default {}' },
  ]

  it('passes for a minimal valid static app', () => {
    const result = validateGeneratedAppStructure([
      ...baseFiles,
      {
        path: 'app/page.tsx',
        content: "import Hero from '@/components/Hero'\nexport default function Page() { return <Hero /> }\n",
      },
      { path: 'components/Hero.tsx', content: 'export default function Hero() { return null }\n' },
    ])

    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('reports missing files from imports', () => {
    const result = validateGeneratedAppStructure([
      ...baseFiles,
      {
        path: 'app/page.tsx',
        content: "import Footer from '@/components/Footer'\nexport default function Page() { return null }\n",
      },
    ])

    expect(result.valid).toBe(false)
    expect(result.issues.some((issue) => issue.includes('Missing file for import @/components/Footer'))).toBe(
      true
    )
  })

  it('reports missing props interfaces', () => {
    const result = validateGeneratedAppStructure([
      ...baseFiles,
      {
        path: 'app/page.tsx',
        content:
          "import AnalyticsClient from '@/components/AnalyticsClient'\nexport default function Page() { const data = {}; return <AnalyticsClient data={data} /> }\n",
      },
      {
        path: 'components/AnalyticsClient.tsx',
        content: 'export default function AnalyticsClient() { return null }\n',
      },
    ])

    expect(result.valid).toBe(false)
    expect(result.issues.some((issue) => issue.includes('props interface'))).toBe(true)
  })

  it('reports wrong use client placement', () => {
    const result = validateGeneratedAppStructure([
      ...baseFiles,
      {
        path: 'components/Counter.tsx',
        content:
          "import { useState } from 'react'\n'use client'\nexport default function Counter() { const [n] = useState(0); return n }\n",
      },
    ])

    expect(result.valid).toBe(false)
    expect(result.issues.some((issue) => issue.includes('"use client" must be the first statement'))).toBe(
      true
    )
  })

  it('reports missing use client for hook usage', () => {
    const result = validateGeneratedAppStructure([
      ...baseFiles,
      {
        path: 'components/Counter.tsx',
        content:
          "import { useState } from 'react'\nexport default function Counter() { const [n] = useState(0); return n }\n",
      },
    ])

    expect(result.valid).toBe(false)
    expect(result.issues.some((issue) => issue.includes('missing "use client"'))).toBe(true)
  })

  it('requires prisma files only when database is enabled', () => {
    const withoutDb = validateGeneratedAppStructure(
      [
        ...baseFiles,
        { path: 'prisma/schema.prisma', content: 'model User { id String @id }' },
        {
          path: 'package.json',
          content: JSON.stringify({
            name: 'demo',
            scripts: { build: 'next build' },
            dependencies: { '@prisma/client': '6.0.0' },
          }),
        },
      ],
      { requiresDatabase: false }
    )

    expect(withoutDb.valid).toBe(false)
    expect(withoutDb.issues.some((issue) => issue.includes('must not include Prisma'))).toBe(true)

    const withDb = validateGeneratedAppStructure(
      [
        {
          path: 'package.json',
          content: JSON.stringify({
            name: 'demo',
            scripts: { build: 'prisma generate && next build' },
            dependencies: { '@prisma/client': '6.0.0' },
            devDependencies: { prisma: '6.0.0' },
          }),
        },
        { path: 'tailwind.config.ts', content: 'export default {}' },
      ],
      { requiresDatabase: true }
    )

    expect(withDb.valid).toBe(false)
    expect(withDb.issues.some((issue) => issue.includes('prisma/schema.prisma'))).toBe(true)
  })

  it('reports missing tailwind config and build script', () => {
    const result = validateGeneratedAppStructure([
      {
        path: 'package.json',
        content: JSON.stringify({ name: 'demo', scripts: { dev: 'next dev' } }),
      },
    ])

    expect(result.valid).toBe(false)
    expect(result.issues.some((issue) => issue.includes('Tailwind config'))).toBe(true)
    expect(result.issues.some((issue) => issue.includes('scripts.build'))).toBe(true)
  })

  it('formats issues for repair prompts', () => {
    const formatted = formatStructureValidationIssues(['Missing file for import @/components/Footer'])
    expect(formatted).toBe('1. Missing file for import @/components/Footer')
  })
})

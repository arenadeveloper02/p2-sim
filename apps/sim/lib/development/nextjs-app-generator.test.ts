/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { capGeneratedAppFiles } from '@/lib/development/nextjs-app-generator'

describe('capGeneratedAppFiles', () => {
  it('preserves required scaffolding when capping a large file list', () => {
    const files = [
      ...Array.from({ length: 40 }, (_, index) => ({
        path: `components/Widget${index}.tsx`,
        content: `export function Widget${index}() { return null }`,
      })),
      { path: 'package.json', content: '{"name":"app"}' },
      { path: 'tailwind.config.ts', content: 'export default {}' },
      { path: 'REPO_SUMMARY.md', content: '# Summary' },
      { path: 'prisma/schema.prisma', content: 'model User { id String @id }' },
      { path: 'lib/prisma.ts', content: 'export const prisma = {}' },
    ]

    const capped = capGeneratedAppFiles(files, 30, true)
    const paths = capped.map((file) => file.path)

    expect(capped.length).toBe(30)
    expect(paths).toContain('package.json')
    expect(paths).toContain('tailwind.config.ts')
    expect(paths).toContain('prisma/schema.prisma')
    expect(paths).toContain('lib/prisma.ts')
    expect(paths).toContain('REPO_SUMMARY.md')
  })

  it('returns the original list when under the cap', () => {
    const files = [
      { path: 'package.json', content: '{}' },
      { path: 'app/page.tsx', content: 'export default function Page() { return null }' },
    ]

    expect(capGeneratedAppFiles(files, 30, true)).toEqual(files)
  })
})

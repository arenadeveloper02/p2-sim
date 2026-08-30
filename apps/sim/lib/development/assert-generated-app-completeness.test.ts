import { describe, expect, it } from 'vitest'
import {
  assertGeneratedAppReadyToPush,
  collectGeneratedAppRoutePaths,
  findTruncatedGeneratedAppFiles,
} from '@/lib/development/assert-generated-app-completeness'

describe('assertGeneratedAppReadyToPush', () => {
  it('rejects truncated file contents', () => {
    expect(() =>
      assertGeneratedAppReadyToPush({
        files: [{ path: 'app/globals.css', content: '@tailwind base;\n…(truncated)' }],
      })
    ).toThrow(/truncated file contents/)
  })

  it('rejects dropped route files against the baseline', () => {
    expect(() =>
      assertGeneratedAppReadyToPush({
        files: [
          { path: 'app/page.tsx', content: 'export default function Home() { return null }' },
        ],
        baselinePaths: [
          'app/page.tsx',
          'app/storyboard/page.tsx',
          'app/api/plan/route.ts',
          'app/api/render/route.ts',
        ],
      })
    ).toThrow(/drop 3 route file/)
  })

  it('rejects a missing manifest path', () => {
    expect(() =>
      assertGeneratedAppReadyToPush({
        files: [{ path: 'app/page.tsx', content: 'export default function Home() { return null }' }],
        expectedPaths: ['app/page.tsx', 'app/brief/page.tsx'],
      })
    ).toThrow(/missing 1 manifest file/)
  })

  it('allows a complete emit', () => {
    const files = [
      { path: 'app/page.tsx', content: 'export default function Home() { return null }' },
      { path: 'app/brief/page.tsx', content: 'export default function Brief() { return null }' },
    ]
    expect(() =>
      assertGeneratedAppReadyToPush({
        files,
        baselinePaths: files.map((file) => file.path),
        expectedPaths: files.map((file) => file.path),
      })
    ).not.toThrow()
  })
})

describe('collectGeneratedAppRoutePaths', () => {
  it('collects app pages and api routes', () => {
    expect(
      collectGeneratedAppRoutePaths([
        { path: 'app/page.tsx' },
        { path: 'app/storyboard/page.tsx' },
        { path: 'app/api/plan/route.ts' },
        { path: 'lib/actions.ts' },
      ])
    ).toEqual(['app/api/plan/route.ts', 'app/storyboard/page.tsx'])
  })
})

describe('findTruncatedGeneratedAppFiles', () => {
  it('finds budget-truncated files', () => {
    expect(
      findTruncatedGeneratedAppFiles([
        { path: 'app/globals.css', content: '/* tokens\n...(truncated)' },
        { path: 'app/page.tsx', content: 'export default function Page() { return null }' },
      ])
    ).toEqual(['app/globals.css'])
  })
})

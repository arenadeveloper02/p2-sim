import { describe, expect, it } from 'vitest'
import { ensureArenaScaffoldFiles, shipsArenaProxyFile } from '@/lib/development/arena/scaffold'

describe('ensureArenaScaffoldFiles', () => {
  it('writes Next 16 proxy.ts and removes deprecated middleware.ts', () => {
    const files = ensureArenaScaffoldFiles([
      {
        path: 'middleware.ts',
        content: 'export function middleware() { return null }',
      },
      {
        path: 'app/layout.tsx',
        content:
          "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html> }",
      },
    ])

    const paths = files.map((file) => file.path)
    expect(paths).toContain('proxy.ts')
    expect(paths).not.toContain('middleware.ts')

    const proxy = files.find((file) => file.path === 'proxy.ts')
    expect(proxy?.content).toContain('export function proxy(')
    expect(proxy?.content).not.toContain('export function middleware(')
  })

  it('removes both root and src legacy middleware variants', () => {
    const files = ensureArenaScaffoldFiles([
      { path: 'middleware.ts', content: 'export function middleware() { return null }' },
      { path: 'src/middleware.ts', content: 'export function middleware() { return null }' },
      {
        path: 'app/layout.tsx',
        content:
          "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html> }",
      },
    ])

    const paths = files.map((file) => file.path)
    expect(paths).not.toContain('middleware.ts')
    expect(paths).not.toContain('src/middleware.ts')
  })

  it('keeps the real emailId gate in the emitted proxy.ts', () => {
    const files = ensureArenaScaffoldFiles([
      {
        path: 'app/layout.tsx',
        content:
          "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html> }",
      },
    ])

    const proxy = files.find((file) => file.path === 'proxy.ts')
    expect(proxy?.content).toContain("searchParams.get('emailId')")
    expect(proxy?.content).toContain('ARENA_EMAIL_COOKIE_NAME')
    expect(proxy?.content).toContain('/access-denied')
  })
})

describe('shipsArenaProxyFile', () => {
  it('detects the arena proxy in the file set', () => {
    const files = ensureArenaScaffoldFiles([
      {
        path: 'app/layout.tsx',
        content:
          "export default function RootLayout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html> }",
      },
    ])
    expect(shipsArenaProxyFile(files)).toBe(true)
  })

  it('ignores non-arena proxy files and apps without a proxy', () => {
    expect(shipsArenaProxyFile([{ path: 'app/page.tsx', content: 'export default 1' }])).toBe(
      false
    )
    expect(
      shipsArenaProxyFile([{ path: 'proxy.ts', content: 'export function proxy() {}' }])
    ).toBe(false)
  })
})

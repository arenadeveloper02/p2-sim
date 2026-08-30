import { describe, expect, it } from 'vitest'
import { ensureArenaScaffoldFiles } from '@/lib/development/arena/scaffold'

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
})

/**
 * @vitest-environment jsdom
 */
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  usePathname: mockUsePathname,
}))

vi.mock('next/image', () => ({
  default: ({ alt }: { alt?: string }) => <img alt={alt} />,
}))

vi.mock('@/app/(landing)/components', () => ({
  LogoShell: ({ children, footer }: { children: ReactNode; footer?: ReactNode }) => (
    <div data-testid='logo-shell'>
      <nav aria-label='Arena home'>logo</nav>
      {children}
      {footer}
    </div>
  ),
}))

vi.mock('@/app/(auth)/components', () => ({
  SupportFooter: () => <div>Need help?</div>,
}))

vi.mock('@/app/_shell/desktop-title-bar', () => ({
  DesktopTitleBarLane: () => <div data-testid='desktop-title-bar-lane' />,
}))

vi.mock('@/app/(interfaces)/chat/components/message/components/ArenaLogo.svg', () => ({
  default: '/arena-logo.svg',
}))

import { InterfacesShell } from '@/app/(interfaces)/components/interfaces-shell/interfaces-shell'

describe('InterfacesShell', () => {
  let unmount: (() => void) | undefined

  beforeEach(() => {
    mockUsePathname.mockReset()
  })

  afterEach(() => {
    unmount?.()
    unmount = undefined
  })

  function render(pathname: string) {
    mockUsePathname.mockReturnValue(pathname)
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    act(() => {
      root.render(
        <InterfacesShell>
          <p>page body</p>
        </InterfacesShell>
      )
    })
    unmount = () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    }
    return container
  }

  it('skips LogoShell and SupportFooter on gui-apps and keeps the desktop title-bar lane', () => {
    const container = render('/gui-apps/preview/draft-1/home')
    expect(container.querySelector('[data-testid="logo-shell"]')).toBeNull()
    expect(container.querySelector('nav')).toBeNull()
    expect(container.textContent).not.toContain('Need help?')
    expect(container.querySelector('[data-testid="desktop-title-bar-lane"]')).toBeTruthy()
    expect(container.textContent).toContain('page body')
  })

  it('keeps LogoShell and SupportFooter on chat gates', () => {
    const container = render('/chat/support-bot')
    expect(container.querySelector('[data-testid="logo-shell"]')).toBeTruthy()
    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('Arena home')
    expect(container.textContent).toContain('Need help?')
    expect(container.textContent).toContain('page body')
  })
})

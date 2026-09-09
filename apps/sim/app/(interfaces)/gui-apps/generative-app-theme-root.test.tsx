/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockUseTheme } = vi.hoisted(() => ({
  mockUseTheme: vi.fn(),
}))

vi.mock('next-themes', () => ({
  useTheme: () => mockUseTheme(),
}))

vi.mock('@/app/(interfaces)/gui-apps/generative-app-theme.css', () => ({}))

import { GenerativeAppThemeRoot } from '@/app/(interfaces)/gui-apps/generative-app-theme-root'

describe('GenerativeAppThemeRoot', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    localStorage.clear()
    mockUseTheme.mockReturnValue({ theme: undefined, resolvedTheme: undefined })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    localStorage.clear()
    vi.clearAllMocks()
  })

  function renderRoot(theme?: { brandColor?: string; colorScheme?: 'light' | 'dark' | 'system' }) {
    act(() => {
      root.render(
        <GenerativeAppThemeRoot theme={theme}>
          <span>content</span>
        </GenerativeAppThemeRoot>
      )
    })
  }

  function guiRoot(): HTMLElement {
    const el = container.querySelector('[data-gui-theme]')
    if (!(el instanceof HTMLElement)) throw new Error('missing data-gui-theme root')
    return el
  }

  it('defaults to light when sim-theme is missing', () => {
    renderRoot({ colorScheme: 'dark' })
    expect(guiRoot().getAttribute('data-gui-theme')).toBe('light')
  })

  it('uses localStorage sim-theme dark even when manifest colorScheme is light', () => {
    localStorage.setItem('sim-theme', 'dark')
    renderRoot({ colorScheme: 'light' })
    expect(guiRoot().getAttribute('data-gui-theme')).toBe('dark')
  })

  it('uses localStorage sim-theme light', () => {
    localStorage.setItem('sim-theme', 'light')
    renderRoot()
    expect(guiRoot().getAttribute('data-gui-theme')).toBe('light')
  })

  it('maps sim-theme system to light', () => {
    localStorage.setItem('sim-theme', 'system')
    renderRoot()
    expect(guiRoot().getAttribute('data-gui-theme')).toBe('light')
  })

  it('follows next-themes resolvedTheme when available', () => {
    mockUseTheme.mockReturnValue({ theme: 'dark', resolvedTheme: 'dark' })
    renderRoot()
    expect(guiRoot().getAttribute('data-gui-theme')).toBe('dark')
  })

  it('updates when a sim-theme storage event is dispatched', () => {
    localStorage.setItem('sim-theme', 'light')
    renderRoot()
    expect(guiRoot().getAttribute('data-gui-theme')).toBe('light')

    act(() => {
      localStorage.setItem('sim-theme', 'dark')
      window.dispatchEvent(new StorageEvent('storage', { key: 'sim-theme', newValue: 'dark' }))
    })
    expect(guiRoot().getAttribute('data-gui-theme')).toBe('dark')
  })

  it('still applies brand CSS variables from manifest.theme', () => {
    renderRoot({ brandColor: '#112233' })
    expect(guiRoot().style.getPropertyValue('--gui-brand')).toBe('#112233')
  })
})

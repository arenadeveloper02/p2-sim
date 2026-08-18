/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SpecRenderErrorBoundary } from '@/app/(interfaces)/gui-apps/spec-render-error-boundary'

function ThrowingChild(): never {
  throw new Error('Card exploded')
}

describe('SpecRenderErrorBoundary', () => {
  let container: HTMLDivElement
  let root: Root

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  it('catches a throw and reports it without blanking the host chrome', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const onError = vi.fn()
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(
        <SpecRenderErrorBoundary onError={onError} fallbackTitle='This page failed to render'>
          <ThrowingChild />
        </SpecRenderErrorBoundary>
      )
    })
    expect(container.querySelector('[data-testid="spec-render-error"]')?.textContent).toContain(
      'This page failed to render'
    )
    expect(container.textContent).toContain('Card exploded')
    expect(onError).toHaveBeenCalledWith('Card exploded')
  })
})

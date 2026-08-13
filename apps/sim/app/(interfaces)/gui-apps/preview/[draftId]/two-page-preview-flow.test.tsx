/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { twoPageDraft, twoPageManifest } from '@/lib/arena-generative-ui/two-page-app.fixture'
import { validateArenaGenerativeManifest } from '@/lib/arena-generative-ui/validate-manifest'
import { GenerativeAppPreviewHost } from '@/app/(interfaces)/gui-apps/preview/[draftId]/generative-app-preview-host'

const { mockPush, mockMutateAsync } = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockMutateAsync: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@sim/emcn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('@sim/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}))

vi.mock('@/hooks/queries/arena-generative-apps', () => ({
  useGenerativeAppDraft: () => ({
    isLoading: false,
    isError: false,
    data: twoPageDraft,
    error: null,
  }),
  useRunGenerativeAppDraftAction: () => ({
    isPending: false,
    mutateAsync: mockMutateAsync,
  }),
}))

describe('two-page GUI App draft preview', () => {
  let container: HTMLDivElement
  let root: Root
  let unmount: (() => void) | undefined

  beforeEach(() => {
    vi.clearAllMocks()
    mockMutateAsync.mockResolvedValue({
      ok: true,
      navigate: 'results',
      setState: { score: '91' },
    })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    unmount?.()
    unmount = undefined
  })

  function render(pagePath: string) {
    act(() => {
      root.render(<GenerativeAppPreviewHost draftId='draft-1' pagePath={pagePath} />)
    })
    unmount = () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    }
    return container
  }

  it('accepts the two-page lead-qualifier manifest', () => {
    const result = validateArenaGenerativeManifest(twoPageManifest, {
      apiBindings: twoPageDraft.apiBindings,
      entryPath: 'home',
    })
    expect(result.success).toBe(true)
    expect(result.manifest?.pages.home).toBeTruthy()
    expect(result.manifest?.pages.results).toBeTruthy()
  })

  it('renders the home form behind the preview banner', () => {
    render('home')
    expect(container.textContent).toContain('Preview — not published. CTAs run against this draft.')
    expect(container.textContent).toContain('Qualify a lead')
    expect(container.querySelector('input[name="name"]')).toBeTruthy()
    expect(container.textContent).toContain('Submit')
  })

  it('navigates to results from the home NavLink', () => {
    render('home')
    const link = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Results'
    )
    expect(link).toBeTruthy()
    act(() => {
      link?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(mockPush).toHaveBeenCalledWith('/gui-apps/preview/draft-1/results')
  })

  it('submits the home CTA, then shows the score on results', async () => {
    render('home')
    const input = container.querySelector('input[name="name"]') as HTMLInputElement
    const form = container.querySelector('form')
    expect(input).toBeTruthy()
    expect(form).toBeTruthy()

    act(() => {
      input.value = 'Ada'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(mockMutateAsync).toHaveBeenCalledWith({
      actionId: 'submit_lead',
      values: expect.objectContaining({ name: 'Ada' }),
    })
    expect(mockPush).toHaveBeenCalledWith('/gui-apps/preview/draft-1/results')

    render('results')
    expect(container.textContent).toContain('Score')
    expect(container.textContent).toContain('91')
  })

  it('returns home from the results Back button', () => {
    render('results')
    const back = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Back'
    )
    expect(back).toBeTruthy()
    act(() => {
      back?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(mockPush).toHaveBeenCalledWith('/gui-apps/preview/draft-1/home')
  })

  it('shows page not found for an unknown path', () => {
    render('missing')
    expect(container.textContent).toContain('Page not found')
  })
})

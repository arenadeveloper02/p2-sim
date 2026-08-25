/**
 * @vitest-environment jsdom
 */
import { act, useLayoutEffect, useState, type ReactNode } from 'react'
import type { Spec } from '@json-render/core'
import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPush, mockMutateAsync, mockUseGenerativeAppDraft, mockRunDraftActionStream } =
  vi.hoisted(() => ({
    mockPush: vi.fn(),
    mockMutateAsync: vi.fn(),
    mockUseGenerativeAppDraft: vi.fn(),
    mockRunDraftActionStream: vi.fn(),
  }))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@sim/emcn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('@/app/(interfaces)/gui-apps/generative-app-theme.css', () => ({}))

vi.mock('@/hooks/queries/arena-generative-apps', () => ({
  useGenerativeAppDraft: (...args: unknown[]) => mockUseGenerativeAppDraft(...args),
  useRunGenerativeAppDraftAction: () => ({
    isPending: false,
    mutateAsync: mockMutateAsync,
  }),
  runGenerativeAppDraftActionStream: (...args: unknown[]) => mockRunDraftActionStream(...args),
}))

import {
  GenerativeAppHostStateProvider,
  useGenerativeAppHostState,
} from '@/app/(interfaces)/gui-apps/generative-app-host-state'
import { GenerativeAppPreviewHost } from '@/app/(interfaces)/gui-apps/preview/[draftId]/generative-app-preview-host'

const homeSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Lead qualifier' },
      children: ['heading', 'nav', 'form'],
    },
    heading: { type: 'Heading', props: { text: 'Lead qualifier', level: 'h1' }, children: [] },
    nav: { type: 'NavLink', props: { label: 'Results', to: 'results' }, children: [] },
    form: { type: 'Form', props: { actionId: 'submit_lead' }, children: ['name', 'submit'] },
    name: { type: 'TextInput', props: { name: 'name', label: 'Name' }, children: [] },
    submit: { type: 'SubmitButton', props: { label: 'Qualify' }, children: [] },
  },
}

const resultsSpec: Spec = {
  root: 'page',
  elements: {
    page: { type: 'Page', props: { title: 'Results' }, children: ['heading', 'score', 'back'] },
    heading: { type: 'Heading', props: { text: 'Results', level: 'h1' }, children: [] },
    score: { type: 'DataText', props: { statePath: 'score', fallback: '—' }, children: [] },
    back: { type: 'Button', props: { label: 'Back', navigateTo: 'home' }, children: [] },
  },
}

const streamingResultsSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Results' },
      children: ['heading', 'progress', 'reply', 'back'],
    },
    heading: { type: 'Heading', props: { text: 'Results', level: 'h1' }, children: [] },
    progress: {
      type: 'ProgressSteps',
      props: { steps: 'Connecting\nResearching', durationMs: 1000 },
      children: [],
    },
    reply: {
      type: 'DataText',
      props: { statePath: 'content', fallback: 'Waiting…' },
      children: [],
    },
    back: { type: 'Button', props: { label: 'Back', navigateTo: 'home' }, children: [] },
  },
}

const streamingResultsPlainSpec: Spec = {
  root: 'page',
  elements: {
    page: { type: 'Page', props: { title: 'Results' }, children: ['heading', 'reply', 'back'] },
    heading: { type: 'Heading', props: { text: 'Results', level: 'h1' }, children: [] },
    reply: {
      type: 'DataText',
      props: { statePath: 'content', fallback: 'Waiting…' },
      children: [],
    },
    back: { type: 'Button', props: { label: 'Back', navigateTo: 'home' }, children: [] },
  },
}

const twoPageDraft = {
  id: 'draft-1',
  title: 'Lead qualifier',
  entryPath: 'home',
  revision: 1,
  workflowId: 'wf-1',
  latestRevisionId: 'rev-1',
  pages: [
    { path: 'home', title: 'Lead qualifier' },
    { path: 'results', title: 'Results' },
  ],
  apiBindings: [
    { key: 'qualify_lead', label: 'Qualify', kind: 'workflow', workflowId: 'wf-bound' },
  ],
  manifest: {
    entryPath: 'home',
    pages: {
      home: { title: 'Lead qualifier', path: 'home', spec: homeSpec },
      results: { title: 'Results', path: 'results', spec: resultsSpec },
    },
    actions: {
      submit_lead: {
        apiKey: 'qualify_lead',
        onSuccess: { navigate: 'results' },
      },
    },
  },
}

function streamingDraft(resultsPageSpec: Spec) {
  return {
    ...twoPageDraft,
    apiBindings: [
      {
        key: 'qualify_lead',
        label: 'Qualify',
        kind: 'workflow' as const,
        workflowId: 'wf-bound',
        stream: true,
      },
    ],
    manifest: {
      ...twoPageDraft.manifest,
      pages: {
        ...twoPageDraft.manifest.pages,
        results: { title: 'Results', path: 'results', spec: resultsPageSpec },
      },
    },
  }
}

describe('GenerativeAppPreviewHost two-page flow', () => {
  let container: HTMLDivElement
  let root: Root
  let pagePath = 'home'

  function renderHost() {
    act(() => {
      root.render(
        <GenerativeAppHostStateProvider>
          <GenerativeAppPreviewHost key={pagePath} draftId='draft-1' pagePath={pagePath} />
        </GenerativeAppHostStateProvider>
      )
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    pagePath = 'home'
    mockUseGenerativeAppDraft.mockReturnValue({
      isLoading: false,
      isError: false,
      data: twoPageDraft,
      error: null,
    })
    mockMutateAsync.mockResolvedValue({
      ok: true,
      navigate: 'results',
      setState: { score: 91 },
    })
    mockPush.mockImplementation((url: string) => {
      const next = url.split('/').pop()
      if (next) {
        pagePath = next
        renderHost()
      }
    })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    renderHost()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('shows the preview banner and home page', () => {
    expect(container.textContent).toContain('Preview — not published. CTAs run against this draft.')
    expect(container.textContent).toContain('Lead qualifier')
    expect(container.textContent).toContain('Qualify')
    expect(container.textContent).not.toContain('Back')
    expect(container.querySelector('[data-testid="copy-page-edit-prompt"]')?.textContent).toContain(
      'Copy page edit prompt'
    )
    expect(container.querySelector('[data-testid="preview-theme-picker"]')).toBeTruthy()
  })

  it('navigates home → results → home without publishing', () => {
    const resultsLink = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Results'
    )
    expect(resultsLink).toBeTruthy()

    act(() => {
      resultsLink?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mockPush).toHaveBeenCalledWith('/gui-apps/preview/draft-1/results')
    expect(container.textContent).toContain('Results')
    expect(container.textContent).toContain('—')
    expect(container.textContent).toContain('Back')

    const back = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Back'
    )
    act(() => {
      back?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(mockPush).toHaveBeenCalledWith('/gui-apps/preview/draft-1/home')
    expect(container.textContent).toContain('Lead qualifier')
    expect(container.textContent).toContain('Qualify')
  })

  it('runs the live CTA and lands on results with the returned score', async () => {
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
    expect(container.textContent).toContain('Results')
    expect(container.textContent).toContain('91')
    const score = Array.from(container.querySelectorAll('p')).find((node) =>
      node.textContent?.includes('91')
    )
    expect(score?.textContent).toBe('91')
  })

  it('shows page not found for an unknown path', () => {
    pagePath = 'missing'
    renderHost()
    expect(container.textContent).toContain('Page not found')
  })

  it('navigates immediately on a streaming CTA and streams content onto results', async () => {
    let finishStream!: (result: { ok: boolean }) => void
    const streamDone = new Promise<{ ok: boolean }>((resolve) => {
      finishStream = resolve
    })
    mockUseGenerativeAppDraft.mockReturnValue({
      isLoading: false,
      isError: false,
      data: streamingDraft(streamingResultsPlainSpec),
      error: null,
    })
    mockRunDraftActionStream.mockImplementation(
      async (options: { onChunk: (content: string) => void }) => {
        options.onChunk('Hello articles')
        return streamDone
      }
    )
    pagePath = 'home'
    renderHost()

    const form = container.querySelector('form')
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(mockPush).toHaveBeenCalledWith('/gui-apps/preview/draft-1/results')
    expect(mockRunDraftActionStream).toHaveBeenCalled()
    expect(container.textContent).toContain('Hello articles')
    expect(container.textContent).toContain('Back')
    expect(container.textContent).not.toContain('Connecting')

    await act(async () => {
      finishStream({ ok: true })
      await streamDone
    })
  })

  it('shows ProgressSteps on results while a streaming CTA is pending', async () => {
    let finishStream!: (result: { ok: boolean }) => void
    const streamDone = new Promise<{ ok: boolean }>((resolve) => {
      finishStream = resolve
    })
    mockUseGenerativeAppDraft.mockReturnValue({
      isLoading: false,
      isError: false,
      data: streamingDraft(streamingResultsSpec),
      error: null,
    })
    mockRunDraftActionStream.mockImplementation(
      async (options: { onChunk: (content: string) => void }) => {
        options.onChunk('Hello articles')
        return streamDone
      }
    )
    pagePath = 'home'
    renderHost()

    const form = container.querySelector('form')
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(container.textContent).toContain('Connecting')
    expect(container.textContent).toContain('Researching')
    expect(container.textContent).toContain('Hello articles')

    await act(async () => {
      finishStream({ ok: true })
      await streamDone
    })

    expect(container.textContent).not.toContain('Connecting')
  })

  it('keeps streamed tokens when the stream fails', async () => {
    mockUseGenerativeAppDraft.mockReturnValue({
      isLoading: false,
      isError: false,
      data: streamingDraft(streamingResultsPlainSpec),
      error: null,
    })
    mockRunDraftActionStream.mockImplementation(
      async (options: { onChunk: (content: string) => void }) => {
        options.onChunk('Partial answer')
        return { ok: false, error: 'HTTP 502: upstream', setState: { content: '' } }
      }
    )
    pagePath = 'home'
    renderHost()

    const form = container.querySelector('form')
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(container.textContent).toContain('Partial answer')
    expect(container.querySelector('[data-testid="action-error-banner"]')?.textContent).toContain(
      'HTTP 502: upstream'
    )
  })

  it('surfaces unresolved statePath as copyable edit instructions', () => {
    mockUseGenerativeAppDraft.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        ...twoPageDraft,
        manifest: {
          ...twoPageDraft.manifest,
          pages: {
            ...twoPageDraft.manifest.pages,
            home: {
              title: 'Lead qualifier',
              path: 'home',
              spec: {
                root: 'page',
                elements: {
                  page: { type: 'Page', props: { title: 'Home' }, children: ['table'] },
                  table: {
                    type: 'Table',
                    props: { statePath: 'articles', columns: 'title' },
                    children: [],
                  },
                },
              },
            },
          },
        },
      },
      error: null,
    })
    pagePath = 'home'
    renderHost()
    expect(
      container.querySelector('[data-testid="preview-diagnostics-banner"]')?.textContent
    ).toContain('Unresolved statePath "articles"')
  })
})

describe('GenerativeAppPreviewHost page onLoad', () => {
  let container: HTMLDivElement
  let root: Root

  const loadingDraft = {
    ...twoPageDraft,
    manifest: {
      ...twoPageDraft.manifest,
      pages: {
        ...twoPageDraft.manifest.pages,
        results: {
          title: 'Results',
          path: 'results',
          spec: resultsSpec,
          onLoad: ['submit_lead'],
        },
      },
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseGenerativeAppDraft.mockReturnValue({
      isLoading: false,
      isError: false,
      data: loadingDraft,
      error: null,
    })
    mockMutateAsync.mockResolvedValue({ ok: true, setState: { score: 91 } })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  async function renderAt(pagePath: string, pageParams?: Record<string, string>) {
    await act(async () => {
      root.render(
        <GenerativeAppHostStateProvider>
          <GenerativeAppPreviewHost draftId='draft-1' pagePath={pagePath} pageParams={pageParams} />
        </GenerativeAppHostStateProvider>
      )
    })
  }

  it('runs the draft page onLoad against the draft and shows the result', async () => {
    await renderAt('results', { id: 'lead_7' })

    expect(mockMutateAsync).toHaveBeenCalledWith({
      actionId: 'submit_lead',
      values: { id: 'lead_7' },
    })
    expect(container.textContent).toContain('91')
  })

  it('leaves the form page alone, since only results declares onLoad', async () => {
    await renderAt('home')

    expect(mockMutateAsync).not.toHaveBeenCalled()
  })

  it('does not run onLoad while a CTA is still writing this page', async () => {
    function ArmPending({ children }: { children: ReactNode }) {
      const { setActionPending } = useGenerativeAppHostState()
      const [ready, setReady] = useState(false)
      useLayoutEffect(() => {
        flushSync(() => {
          setActionPending(true)
        })
        setReady(true)
      }, [setActionPending])
      if (!ready) return null
      return children
    }

    await act(async () => {
      root.render(
        <GenerativeAppHostStateProvider>
          <ArmPending>
            <GenerativeAppPreviewHost
              draftId='draft-1'
              pagePath='results'
              pageParams={{ id: 'lead_7' }}
            />
          </ArmPending>
        </GenerativeAppHostStateProvider>
      )
    })

    expect(mockMutateAsync).not.toHaveBeenCalled()
  })
})

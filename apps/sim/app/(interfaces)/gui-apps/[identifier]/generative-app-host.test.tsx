/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import type { Spec } from '@json-render/core'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockPush, mockMutateAsync, mockUseDeployedAppConfig, mockUseDeployedAppPage } = vi.hoisted(
  () => ({
    mockPush: vi.fn(),
    mockMutateAsync: vi.fn(),
    mockUseDeployedAppConfig: vi.fn(),
    mockUseDeployedAppPage: vi.fn(),
  })
)

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}))

vi.mock('@sim/emcn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
  Button: ({ children }: { children?: unknown }) => <button type='button'>{children}</button>,
  Input: (props: Record<string, unknown>) => <input {...props} />,
  InputOTP: ({ children }: { children?: unknown }) => <div>{children}</div>,
  InputOTPGroup: ({ children }: { children?: unknown }) => <div>{children}</div>,
  InputOTPSlot: () => <div />,
  Label: ({ children, htmlFor }: { children?: unknown; htmlFor?: string }) => (
    <label htmlFor={htmlFor}>{children}</label>
  ),
}))

vi.mock('@/app/(interfaces)/gui-apps/generative-app-theme.css', () => ({}))

vi.mock('@/hooks/queries/arena-generative-apps', () => ({
  useDeployedAppConfig: (...args: unknown[]) => mockUseDeployedAppConfig(...args),
  useDeployedAppPage: (...args: unknown[]) => mockUseDeployedAppPage(...args),
  useRunDeployedAppAction: () => ({
    isPending: false,
    mutateAsync: mockMutateAsync,
  }),
  useDeployedAppPasswordAuth: () => ({ mutate: vi.fn(), isPending: false }),
  useDeployedAppEmailOtpRequest: () => ({ mutate: vi.fn(), isPending: false }),
  useDeployedAppEmailOtpVerify: () => ({ mutate: vi.fn(), isPending: false }),
  runDeployedAppActionStream: vi.fn(),
}))

import { GenerativeAppHost } from '@/app/(interfaces)/gui-apps/[identifier]/generative-app-host'
import { GenerativeAppHostStateProvider } from '@/app/(interfaces)/gui-apps/generative-app-host-state'

const chatSpec: Spec = {
  root: 'page',
  elements: {
    page: { type: 'Page', props: { title: 'Chat' }, children: ['form', 'reply'] },
    form: { type: 'Form', props: { actionId: 'ask_chat' }, children: ['prompt', 'submit'] },
    prompt: { type: 'TextInput', props: { name: 'input', label: 'Message' }, children: [] },
    submit: { type: 'SubmitButton', props: { label: 'Send' }, children: [] },
    reply: {
      type: 'DataText',
      props: { statePath: 'content', fallback: 'Waiting…' },
      children: [],
    },
  },
}

describe('GenerativeAppHost non-streaming JSON', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDeployedAppConfig.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kind: 'config',
        config: {
          streamingActionIds: [],
          actionNavigate: {},
        },
      },
      error: null,
    })
    mockUseDeployedAppPage.mockReturnValue({
      isLoading: false,
      data: { path: 'chat', title: 'Chat', spec: chatSpec },
    })
    mockMutateAsync.mockResolvedValue({
      ok: true,
      setState: { output: { content: 'Hi' }, content: 'Hi' },
    })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(
        <GenerativeAppHostStateProvider>
          <GenerativeAppHost identifier='gui-chatapp' pagePath='chat' emailId='' />
        </GenerativeAppHostStateProvider>
      )
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('merges JSON setState onto DataText without streaming', async () => {
    const form = container.querySelector('form')
    expect(form).toBeTruthy()
    expect(container.textContent).toContain('Waiting…')

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(mockMutateAsync).toHaveBeenCalledWith({
      actionId: 'ask_chat',
      values: expect.any(Object),
      emailId: undefined,
    })
    expect(container.textContent).toContain('Hi')
    expect(container.textContent).not.toContain('Waiting…')
  })

  it('navigates to the result page before the request resolves and keeps a loading placeholder', async () => {
    mockUseDeployedAppConfig.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kind: 'config',
        config: { streamingActionIds: [], actionNavigate: { ask_chat: 'results' } },
      },
      error: null,
    })
    let resolveAction: (value: unknown) => void = () => {}
    mockMutateAsync.mockReturnValue(
      new Promise((resolve) => {
        resolveAction = resolve
      })
    )
    act(() => {
      root.render(
        <GenerativeAppHostStateProvider>
          <GenerativeAppHost identifier='gui-chatapp' pagePath='chat' emailId='' />
        </GenerativeAppHostStateProvider>
      )
    })

    const form = container.querySelector('form')
    act(() => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(mockPush).toHaveBeenCalledWith('/gui-apps/gui-chatapp/results')
    expect(container.querySelector('[data-testid="skeleton"]')).toBeTruthy()
    expect(container.textContent).not.toContain('Waiting…')

    await act(async () => {
      resolveAction({ ok: true, setState: { content: 'Hi' } })
    })

    expect(container.querySelector('[data-testid="skeleton"]')).toBeNull()
    expect(container.textContent).toContain('Hi')
  })

  async function submit() {
    const form = container.querySelector('form')
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
  }

  it('shows a banner when an action returns an error the spec never binds', async () => {
    mockMutateAsync.mockResolvedValue({ ok: false, error: 'HTTP 422: company is required' })

    await submit()

    const banner = container.querySelector('[data-testid="action-error-banner"]')
    expect(banner).toBeTruthy()
    expect(banner?.textContent).toContain('HTTP 422: company is required')
  })

  it('shows a banner when the request itself throws', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Network unreachable'))

    await submit()

    expect(container.querySelector('[data-testid="action-error-banner"]')?.textContent).toContain(
      'Network unreachable'
    )
  })

  it('dismisses the banner on demand', async () => {
    mockMutateAsync.mockResolvedValue({ ok: false, error: 'Boom' })
    await submit()

    const dismiss = container.querySelector(
      '[data-testid="action-error-dismiss"]'
    ) as HTMLButtonElement
    await act(async () => {
      dismiss.click()
    })

    expect(container.querySelector('[data-testid="action-error-banner"]')).toBeNull()
  })

  it('clears a stale banner when the next attempt succeeds', async () => {
    mockMutateAsync.mockResolvedValue({ ok: false, error: 'Boom' })
    await submit()
    expect(container.querySelector('[data-testid="action-error-banner"]')).toBeTruthy()

    mockMutateAsync.mockResolvedValue({ ok: true, setState: { content: 'Hi' } })
    await submit()

    expect(container.querySelector('[data-testid="action-error-banner"]')).toBeNull()
    expect(container.textContent).toContain('Hi')
  })

  it('retries the last action from the error banner without changing the runner copy', async () => {
    mockMutateAsync.mockResolvedValue({ ok: false, error: 'HTTP 422: company is required' })
    await submit()
    expect(mockMutateAsync).toHaveBeenCalledTimes(1)

    mockMutateAsync.mockResolvedValue({ ok: true, setState: { content: 'Hi' } })
    const retry = container.querySelector('[data-testid="action-error-retry"]') as HTMLButtonElement
    await act(async () => {
      retry.click()
    })

    expect(mockMutateAsync).toHaveBeenCalledTimes(2)
    expect(container.querySelector('[data-testid="action-error-banner"]')).toBeNull()
    expect(container.textContent).toContain('Hi')
  })

  it('hides Retry when the action plan says retry is false', async () => {
    mockUseDeployedAppConfig.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kind: 'config',
        config: {
          streamingActionIds: [],
          actionNavigate: {},
          uxPlan: {
            actions: { ask_chat: { kind: 'mutation', confirm: false, retry: false } },
            fallbackLoading: {},
          },
        },
      },
      error: null,
    })
    act(() => {
      root.render(
        <GenerativeAppHostStateProvider>
          <GenerativeAppHost identifier='gui-chatapp' pagePath='chat' emailId='' />
        </GenerativeAppHostStateProvider>
      )
    })
    mockMutateAsync.mockResolvedValue({ ok: false, error: 'Boom' })
    await submit()
    expect(container.querySelector('[data-testid="action-error-banner"]')).toBeTruthy()
    expect(container.querySelector('[data-testid="action-error-retry"]')).toBeNull()
  })

  it('ignores a second submit while the first CTA is in flight', async () => {
    let release: (value: { ok: boolean }) => void = () => {}
    mockMutateAsync.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        })
    )
    const form = container.querySelector('form')
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(mockMutateAsync).toHaveBeenCalledTimes(1)
    await act(async () => {
      release({ ok: true })
    })
  })

  it('toasts a same-page save that has no visible result patch', async () => {
    mockMutateAsync.mockResolvedValue({ ok: true })
    await submit()
    expect(container.querySelector('[data-testid="action-success-toast"]')?.textContent).toBe(
      'Saved'
    )
  })

  it('does not toast when navigate-first takes the user to the next page', async () => {
    mockUseDeployedAppConfig.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kind: 'config',
        config: { streamingActionIds: [], actionNavigate: { ask_chat: 'results' } },
      },
      error: null,
    })
    mockMutateAsync.mockResolvedValue({ ok: true, setState: { content: 'Hi' } })
    act(() => {
      root.render(
        <GenerativeAppHostStateProvider>
          <GenerativeAppHost identifier='gui-chatapp' pagePath='chat' emailId='' />
        </GenerativeAppHostStateProvider>
      )
    })
    await submit()
    expect(mockPush).toHaveBeenCalledWith('/gui-apps/gui-chatapp/results')
    expect(container.querySelector('[data-testid="action-success-toast"]')).toBeNull()
  })
})

const dashboardSpec: Spec = {
  root: 'page',
  elements: {
    page: { type: 'Page', props: { title: 'Dashboard' }, children: ['total', 'summary'] },
    total: {
      type: 'Stat',
      props: { label: 'Total orders', value: null, statePath: 'totalOrders' },
      children: [],
    },
    summary: {
      type: 'DataText',
      props: { statePath: 'content', fallback: 'No summary yet' },
      children: [],
    },
  },
}

describe('GenerativeAppHost page onLoad', () => {
  let container: HTMLDivElement
  let root: Root

  function mockConfig(overrides: Record<string, unknown> = {}) {
    mockUseDeployedAppConfig.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kind: 'config',
        config: {
          streamingActionIds: [],
          actionNavigate: {},
          pageOnLoad: { dashboard: ['load_dashboard'] },
          ...overrides,
        },
      },
      error: null,
    })
  }

  function render(props: { pageParams?: Record<string, string>; pagePath?: string } = {}) {
    act(() => {
      root.render(
        <GenerativeAppHostStateProvider>
          <GenerativeAppHost
            identifier='gui-ops'
            pagePath={props.pagePath ?? 'dashboard'}
            emailId=''
            pageParams={props.pageParams}
          />
        </GenerativeAppHostStateProvider>
      )
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockConfig()
    mockUseDeployedAppPage.mockReturnValue({
      isLoading: false,
      data: { path: 'dashboard', title: 'Dashboard', spec: dashboardSpec },
    })
    mockMutateAsync.mockResolvedValue({
      ok: true,
      setState: { totalOrders: 412, content: 'Steady week' },
    })
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

  it('fetches and shows the page data on arrival, with no user interaction', async () => {
    await act(async () => {
      render()
    })

    expect(mockMutateAsync).toHaveBeenCalledTimes(1)
    expect(mockMutateAsync).toHaveBeenCalledWith({
      actionId: 'load_dashboard',
      values: {},
      emailId: undefined,
    })
    expect(container.textContent).toContain('412')
    expect(container.textContent).toContain('Steady week')
    expect(container.textContent).not.toContain('No summary yet')
  })

  it('passes the page query params as the load action input', async () => {
    await act(async () => {
      render({ pageParams: { id: 'ord_9', tab: 'items' } })
    })

    expect(mockMutateAsync).toHaveBeenCalledWith({
      actionId: 'load_dashboard',
      values: { id: 'ord_9', tab: 'items' },
      emailId: undefined,
    })
  })

  it('shows a loading placeholder until the load resolves', async () => {
    let resolveLoad: (value: unknown) => void = () => {}
    mockMutateAsync.mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve
      })
    )

    render()

    expect(container.querySelector('[data-testid="skeleton"]')).toBeTruthy()

    await act(async () => {
      resolveLoad({ ok: true, setState: { totalOrders: 412, content: 'Steady week' } })
    })

    expect(container.querySelector('[data-testid="skeleton"]')).toBeNull()
    expect(container.textContent).toContain('412')
  })

  it('runs the load once even though each render passes a fresh pageParams object', async () => {
    await act(async () => {
      render({ pageParams: { id: 'ord_9' } })
    })
    await act(async () => {
      render({ pageParams: { id: 'ord_9' } })
    })

    expect(mockMutateAsync).toHaveBeenCalledTimes(1)
  })

  it('reloads when a page param changes, because it is a different record', async () => {
    await act(async () => {
      render({ pageParams: { id: 'ord_9' } })
    })
    await act(async () => {
      render({ pageParams: { id: 'ord_10' } })
    })

    expect(mockMutateAsync).toHaveBeenCalledTimes(2)
    expect(mockMutateAsync).toHaveBeenLastCalledWith({
      actionId: 'load_dashboard',
      values: { id: 'ord_10' },
      emailId: undefined,
    })
  })

  it('leaves a page without onLoad alone', async () => {
    mockConfig({ pageOnLoad: {} })

    await act(async () => {
      render()
    })

    expect(mockMutateAsync).not.toHaveBeenCalled()
    expect(container.textContent).toContain('No summary yet')
  })

  it('reloads on return after a detour through a page that has no onLoad', async () => {
    await act(async () => {
      render()
    })
    expect(mockMutateAsync).toHaveBeenCalledTimes(1)

    mockUseDeployedAppPage.mockReturnValue({
      isLoading: false,
      data: { path: 'settings', title: 'Settings', spec: dashboardSpec },
    })
    await act(async () => {
      render({ pagePath: 'settings' })
    })
    expect(mockMutateAsync).toHaveBeenCalledTimes(1)

    mockUseDeployedAppPage.mockReturnValue({
      isLoading: false,
      data: { path: 'dashboard', title: 'Dashboard', spec: dashboardSpec },
    })
    await act(async () => {
      render({ pagePath: 'dashboard' })
    })

    expect(mockMutateAsync).toHaveBeenCalledTimes(2)
  })

  it('stays on the page when the load action declares onSuccess.navigate', async () => {
    mockConfig({ actionNavigate: { load_dashboard: 'other' } })

    await act(async () => {
      render()
    })

    expect(mockPush).not.toHaveBeenCalled()
  })

  it('surfaces a failed load in the error banner', async () => {
    mockMutateAsync.mockResolvedValue({ ok: false, error: 'HTTP 503: upstream unavailable' })

    await act(async () => {
      render()
    })

    expect(container.querySelector('[data-testid="action-error-banner"]')?.textContent).toContain(
      'HTTP 503: upstream unavailable'
    )
  })

  it('surfaces a load that throws', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Network unreachable'))

    await act(async () => {
      render()
    })

    expect(container.querySelector('[data-testid="action-error-banner"]')?.textContent).toContain(
      'Network unreachable'
    )
  })
})

const deleteSpec: Spec = {
  root: 'page',
  elements: {
    page: { type: 'Page', props: { title: 'Settings' }, children: ['remove'] },
    remove: {
      type: 'Button',
      props: { label: 'Delete', actionId: 'delete_item', variant: 'destructive' },
      children: [],
    },
  },
}

describe('GenerativeAppHost destructive confirm', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDeployedAppConfig.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kind: 'config',
        config: {
          streamingActionIds: [],
          actionNavigate: {},
          uxPlan: {
            actions: {
              delete_item: { kind: 'mutation', confirm: true, retry: true },
            },
            fallbackLoading: {},
          },
        },
      },
      error: null,
    })
    mockUseDeployedAppPage.mockReturnValue({
      isLoading: false,
      data: { path: 'settings', title: 'Settings', spec: deleteSpec },
    })
    mockMutateAsync.mockResolvedValue({ ok: true })
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(
        <GenerativeAppHostStateProvider>
          <GenerativeAppHost identifier='gui-chatapp' pagePath='settings' emailId='' />
        </GenerativeAppHostStateProvider>
      )
    })
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it('waits for confirm before running a destructive action', async () => {
    const del = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Delete')
    )
    await act(async () => {
      del?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(mockMutateAsync).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="destructive-confirm"]')).toBeTruthy()

    await act(async () => {
      container
        .querySelector('[data-testid="destructive-confirm-cancel"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(mockMutateAsync).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="destructive-confirm"]')).toBeNull()

    await act(async () => {
      del?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      container
        .querySelector('[data-testid="destructive-confirm-accept"]')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(mockMutateAsync).toHaveBeenCalledWith({
      actionId: 'delete_item',
      values: expect.any(Object),
      emailId: undefined,
    })
  })
})

const historySpec: Spec = {
  root: 'page',
  elements: {
    page: { type: 'Page', props: { title: 'History' }, children: ['repeat', 'detail', 'back'] },
    repeat: { type: 'Repeat', props: { statePath: 'history' }, children: ['card'] },
    card: { type: 'Card', props: { title: '{item.keyword}' }, children: ['open'] },
    open: { type: 'Button', props: { label: 'Open', selectItem: true }, children: [] },
    detail: {
      type: 'DataText',
      props: { statePath: 'content', fallback: '', showWhen: 'selectedId' },
      children: [],
    },
    back: {
      type: 'Button',
      props: { label: 'Back', clearItem: true, showWhen: 'selectedId' },
      children: [],
    },
  },
}

describe('GenerativeAppHost same-page History Open', () => {
  let container: HTMLDivElement
  let root: Root
  let scrollTo: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.clearAllMocks()
    scrollTo = vi.fn()
    window.scrollTo = scrollTo
    mockUseDeployedAppConfig.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kind: 'config',
        config: {
          streamingActionIds: [],
          actionNavigate: {},
          pageOnLoad: { history: ['load_history'] },
        },
      },
      error: null,
    })
    mockUseDeployedAppPage.mockReturnValue({
      isLoading: false,
      data: { path: 'history', title: 'History', spec: historySpec },
    })
    mockMutateAsync.mockResolvedValue({
      ok: true,
      setState: {
        history: [{ id: 'run_1', keyword: 'Dental implants', output: '# Full report' }],
      },
    })
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

  it('swaps the list for the row markdown and Back restores the list', async () => {
    await act(async () => {
      root.render(
        <GenerativeAppHostStateProvider>
          <GenerativeAppHost identifier='gui-history' pagePath='history' emailId='' />
        </GenerativeAppHostStateProvider>
      )
    })

    expect(container.textContent).toContain('Dental implants')
    expect(container.textContent).toContain('Open')
    expect(container.textContent).not.toContain('Full report')

    const open = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Open'
    )
    await act(async () => {
      open?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).not.toContain('Open')
    expect(container.textContent).toContain('Full report')
    expect(container.textContent).toContain('Back')
    expect(scrollTo).toHaveBeenCalledWith(0, 0)

    const back = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Back'
    )
    await act(async () => {
      back?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('Dental implants')
    expect(container.textContent).toContain('Open')
    expect(container.textContent).not.toContain('Full report')
    expect(scrollTo).toHaveBeenCalledTimes(2)
    expect(mockPush).not.toHaveBeenCalled()
  })
})

const echoHomeSpec: Spec = {
  root: 'page',
  elements: {
    page: { type: 'Page', props: { title: 'Generator' }, children: ['form'] },
    form: {
      type: 'Form',
      props: { actionId: 'recommend_articles' },
      children: ['keyword', 'client', 'submit'],
    },
    keyword: {
      type: 'TextInput',
      props: { name: 'targetKeyword', label: 'Target Keyword' },
      children: [],
    },
    client: {
      type: 'TextInput',
      props: { name: 'clientBrand', label: 'Client / Brand' },
      children: [],
    },
    submit: { type: 'SubmitButton', props: { label: 'Generate Recommendations' }, children: [] },
  },
}

const echoResultsSpec: Spec = {
  root: 'page',
  elements: {
    page: { type: 'Page', props: { title: 'Results' }, children: ['header', 'keyword', 'client'] },
    header: {
      type: 'PageHeader',
      props: {
        kicker: 'Recommendations',
        title: 'Working on "{targetKeyword}" for {clientBrand}',
      },
      children: [],
    },
    keyword: {
      type: 'Chip',
      props: { text: 'Keyword: {targetKeyword}', tone: 'info' },
      children: [],
    },
    client: {
      type: 'Chip',
      props: { text: 'Client: {clientBrand}', tone: 'muted' },
      children: [],
    },
  },
}

describe('GenerativeAppHost form echo on Results', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseDeployedAppConfig.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        kind: 'config',
        config: {
          streamingActionIds: [],
          actionNavigate: { recommend_articles: 'results' },
          pageOnLoad: {},
        },
      },
      error: null,
    })
    mockUseDeployedAppPage.mockReturnValue({
      isLoading: false,
      data: { path: 'home', title: 'Generator', spec: echoHomeSpec },
    })
    mockMutateAsync.mockReturnValue(new Promise(() => {}))
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

  function renderHost(pagePath: string, spec: Spec) {
    mockUseDeployedAppPage.mockReturnValue({
      isLoading: false,
      data: { path: pagePath, title: pagePath, spec },
    })
    act(() => {
      root.render(
        <GenerativeAppHostStateProvider>
          <GenerativeAppHost identifier='gui-articles' pagePath={pagePath} emailId='' />
        </GenerativeAppHostStateProvider>
      )
    })
  }

  it('shows typed targetKeyword and clientBrand on Results while the CTA is pending', async () => {
    renderHost('home', echoHomeSpec)

    const keyword = container.querySelector('input[name="targetKeyword"]') as HTMLInputElement
    const client = container.querySelector('input[name="clientBrand"]') as HTMLInputElement
    act(() => {
      keyword.value = 'Dental implants'
      keyword.dispatchEvent(new Event('input', { bubbles: true }))
      keyword.dispatchEvent(new Event('change', { bubbles: true }))
      client.value = '42 North Dental'
      client.dispatchEvent(new Event('input', { bubbles: true }))
      client.dispatchEvent(new Event('change', { bubbles: true }))
    })

    const form = container.querySelector('form')
    act(() => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(mockPush).toHaveBeenCalledWith('/gui-apps/gui-articles/results')

    renderHost('results', echoResultsSpec)

    expect(container.textContent).toContain('Working on "Dental implants" for 42 North Dental')
    expect(container.textContent).toContain('Keyword: Dental implants')
    expect(container.textContent).toContain('Client: 42 North Dental')
    expect(container.textContent).not.toContain('Working on ""')
  })
})

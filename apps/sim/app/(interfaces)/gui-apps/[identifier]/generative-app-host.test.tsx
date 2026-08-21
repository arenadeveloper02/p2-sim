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
      data: { kind: 'config', config: { streamingActionIds: [], actionNavigate: {} } },
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
      container.querySelector('[data-testid="destructive-confirm-cancel"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
    })
    expect(mockMutateAsync).not.toHaveBeenCalled()
    expect(container.querySelector('[data-testid="destructive-confirm"]')).toBeNull()

    await act(async () => {
      del?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await act(async () => {
      container.querySelector('[data-testid="destructive-confirm-accept"]')?.dispatchEvent(
        new MouseEvent('click', { bubbles: true })
      )
    })
    expect(mockMutateAsync).toHaveBeenCalledWith({
      actionId: 'delete_item',
      values: expect.any(Object),
      emailId: undefined,
    })
  })
})

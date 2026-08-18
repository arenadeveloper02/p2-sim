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
  Label: ({ children }: { children?: unknown }) => <label>{children}</label>,
}))

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
      '[data-testid="action-error-banner"] button'
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
})

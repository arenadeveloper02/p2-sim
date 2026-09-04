/**
 * @vitest-environment jsdom
 */
import { act } from 'react'
import type { Spec } from '@json-render/core'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@sim/emcn', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('streamdown/styles.css', () => ({}))

vi.mock('@/app/(interfaces)/gui-apps/generative-app-theme.css', () => ({}))

vi.mock('echarts', () => ({
  init: () => ({
    setOption: () => undefined,
    resize: () => undefined,
    dispose: () => undefined,
  }),
}))

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: { alt?: string }) => <img alt={alt} {...props} />,
}))

vi.mock('@/app/(interfaces)/chat/components/message/components/ArenaLogo.svg', () => ({
  default: '/arena-logo.svg',
}))

import type { ArenaGenerativeChatProtocol } from '@/lib/arena-generative-ui/chat-protocol'
import {
  type ArenaGenerativeUxPlan,
  injectSamePageSelectChrome,
} from '@/lib/arena-generative-ui/ux-compiler'
import { SpecRenderer } from '@/app/(interfaces)/gui-apps/[identifier]/spec-renderer'

const homeSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Home' },
      children: ['nav', 'form'],
    },
    nav: {
      type: 'NavLink',
      props: { label: 'Results', to: 'results' },
      children: [],
    },
    form: {
      type: 'Form',
      props: { actionId: 'submit_lead' },
      children: ['name', 'submit'],
    },
    name: {
      type: 'TextInput',
      props: { name: 'name', label: 'Name' },
      children: [],
    },
    submit: {
      type: 'SubmitButton',
      props: { label: 'Submit' },
      children: [],
    },
  },
}

const replySpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Chat' },
      children: ['reply'],
    },
    reply: {
      type: 'DataText',
      props: { statePath: 'output.content', fallback: 'Waiting for a reply…' },
      children: [],
    },
  },
}

const progressSpec: Spec = {
  root: 'page',
  elements: {
    page: {
      type: 'Page',
      props: { title: 'Home' },
      children: ['progress'],
    },
    progress: {
      type: 'ProgressSteps',
      props: {
        steps: 'Connecting\nResearching',
        durationMs: 1000,
      },
      children: [],
    },
  },
}

describe('SpecRenderer', () => {
  let unmount: (() => void) | undefined

  afterEach(() => {
    unmount?.()
    unmount = undefined
  })

  function render(options?: {
    spec?: Spec
    state?: Record<string, unknown>
    pending?: boolean
    pendingActionIds?: ReadonlySet<string>
    actionHostKeys?: Record<string, readonly string[]>
    proseAliasKeys?: readonly string[]
    actionHiddenInputs?: Record<string, readonly string[]>
    actionChatProtocol?: Record<string, ArenaGenerativeChatProtocol>
    uxPlan?: ArenaGenerativeUxPlan
    currentPath?: string
    onNavigate?: ReturnType<typeof vi.fn>
    onRunAction?: ReturnType<typeof vi.fn>
    onSelectItem?: ReturnType<typeof vi.fn>
    onClearItem?: ReturnType<typeof vi.fn>
    onClearSelection?: ReturnType<typeof vi.fn>
    onCancelPending?: ReturnType<typeof vi.fn>
  }) {
    const onNavigate = options?.onNavigate ?? vi.fn()
    const onRunAction = options?.onRunAction ?? vi.fn().mockResolvedValue(undefined)
    const onSelectItem = options?.onSelectItem ?? vi.fn()
    const onClearItem = options?.onClearItem ?? vi.fn()
    const onClearSelection = options?.onClearSelection ?? vi.fn()
    const onCancelPending = options?.onCancelPending ?? vi.fn()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root: Root = createRoot(container)
    act(() => {
      root.render(
        <SpecRenderer
          spec={options?.spec ?? homeSpec}
          state={options?.state ?? {}}
          pending={options?.pending ?? false}
          pendingActionIds={options?.pendingActionIds}
          actionHostKeys={options?.actionHostKeys}
          proseAliasKeys={options?.proseAliasKeys}
          actionHiddenInputs={options?.actionHiddenInputs}
          actionChatProtocol={options?.actionChatProtocol}
          uxPlan={options?.uxPlan}
          currentPath={options?.currentPath}
          onNavigate={onNavigate}
          onRunAction={onRunAction}
          onSelectItem={onSelectItem}
          onClearItem={onClearItem}
          onClearSelection={onClearSelection}
          onCancelPending={onCancelPending}
        />
      )
    })
    unmount = () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    }
    return {
      container,
      onNavigate,
      onRunAction,
      onSelectItem,
      onClearItem,
      onClearSelection,
      onCancelPending,
    }
  }

  it('navigates when a NavLink is clicked', () => {
    const { container, onNavigate } = render()
    const link = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Results'
    )
    expect(link).toBeTruthy()
    act(() => {
      link?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onNavigate).toHaveBeenCalledWith('results')
  })

  it('posts form values through onRunAction', () => {
    const { container, onRunAction } = render()
    const input = container.querySelector('input[name="name"]') as HTMLInputElement
    const form = container.querySelector('form')
    expect(input).toBeTruthy()
    expect(form).toBeTruthy()

    act(() => {
      input.value = 'Ada'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    })

    act(() => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(onRunAction).toHaveBeenCalledWith(
      'submit_lead',
      expect.objectContaining({ name: 'Ada' })
    )
  })

  describe('form controls', () => {
    function formSpec(
      fields: Record<string, { type: string; props: Record<string, unknown> }>
    ): Spec {
      return {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['form'] },
          form: {
            type: 'Form',
            props: { actionId: 'save' },
            children: [...Object.keys(fields), 'submit'],
          },
          ...Object.fromEntries(
            Object.entries(fields).map(([id, field]) => [
              id,
              { type: field.type, props: field.props, children: [] },
            ])
          ),
          submit: { type: 'SubmitButton', props: { label: 'Save' }, children: [] },
        },
      }
    }

    it('blocks submit and shows errorText when a required field is empty', () => {
      const { container, onRunAction } = render({
        spec: formSpec({
          name: {
            type: 'TextInput',
            props: { name: 'name', label: 'Name', required: true, errorText: 'Name is required' },
          },
        }),
      })
      act(() => {
        container
          .querySelector('form')
          ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      })
      expect(onRunAction).not.toHaveBeenCalled()
      expect(container.querySelector('[data-testid="field-error-name"]')?.textContent).toBe(
        'Name is required'
      )
    })

    it('hides a showWhen field and omits it from the action payload', () => {
      const { container, onRunAction } = render({
        spec: formSpec({
          notify: {
            type: 'Switch',
            props: { name: 'notify', label: 'Notify', defaultChecked: false },
          },
          email: {
            type: 'TextInput',
            props: { name: 'email', label: 'Email', required: true, showWhen: 'notify' },
          },
        }),
      })
      expect(container.querySelector('input[name="email"]')).toBeNull()
      act(() => {
        container
          .querySelector('form')
          ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      })
      expect(onRunAction).toHaveBeenCalledWith('save', expect.objectContaining({ notify: false }))
      expect(onRunAction.mock.calls[0]?.[1]).not.toHaveProperty('email')
    })

    it('hides visitorEmail fields and omits them from the action payload', () => {
      const { container, onRunAction } = render({
        spec: formSpec({
          company: {
            type: 'TextInput',
            props: { name: 'company', label: 'Company', defaultValue: 'Acme' },
          },
          userEmail: {
            type: 'TextInput',
            props: { name: 'userEmail', label: 'Your email', defaultValue: 'typed@acme.com' },
          },
        }),
        actionHiddenInputs: { save: ['userEmail'] },
      })
      expect(container.querySelector('input[name="userEmail"]')).toBeNull()
      expect(container.querySelector('input[name="company"]')).toBeTruthy()
      act(() => {
        container
          .querySelector('form')
          ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      })
      expect(onRunAction).toHaveBeenCalledWith('save', expect.objectContaining({ company: 'Acme' }))
      expect(onRunAction.mock.calls[0]?.[1]).not.toHaveProperty('userEmail')
    })

    it('submits Checkbox, NumberInput, and MultiSelect with coerced types', () => {
      const { container, onRunAction } = render({
        spec: formSpec({
          agree: {
            type: 'Checkbox',
            props: { name: 'agree', label: 'Agree', defaultChecked: true },
          },
          count: {
            type: 'NumberInput',
            props: { name: 'count', label: 'Count', defaultValue: '3' },
          },
          tags: {
            type: 'MultiSelect',
            props: {
              name: 'tags',
              label: 'Tags',
              options: 'alpha, beta, gamma',
              defaultValue: 'alpha, gamma',
            },
          },
        }),
      })
      act(() => {
        container
          .querySelector('form')
          ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      })
      expect(onRunAction).toHaveBeenCalledWith('save', {
        agree: true,
        count: 3,
        tags: ['alpha', 'gamma'],
      })
    })

    it('seeds a field from host state via statePath', () => {
      const { container } = render({
        spec: formSpec({
          company: {
            type: 'TextInput',
            props: { name: 'company', label: 'Company', statePath: 'company' },
          },
        }),
        state: { company: 'Arena' },
      })
      expect((container.querySelector('input[name="company"]') as HTMLInputElement).value).toBe(
        'Arena'
      )
    })

    it('renders RadioGroup and DateInput', () => {
      const { container } = render({
        spec: formSpec({
          channel: {
            type: 'RadioGroup',
            props: {
              name: 'channel',
              label: 'Channel',
              options: 'email, sms',
              defaultValue: 'sms',
            },
          },
          start: {
            type: 'DateInput',
            props: { name: 'start', label: 'Start', defaultValue: '2026-08-18' },
          },
        }),
      })
      const sms = container.querySelector('input[type="radio"][value="sms"]') as HTMLInputElement
      expect(sms.checked).toBe(true)
      expect((container.querySelector('input[type="date"]') as HTMLInputElement).value).toBe(
        '2026-08-18'
      )
    })
  })

  it('uses SubmitButton.actionId when Form.actionId is missing', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: { title: 'Chat' }, children: ['form'] },
        form: { type: 'Form', props: {}, children: ['prompt', 'submit'] },
        prompt: { type: 'TextInput', props: { name: 'input', label: 'Message' }, children: [] },
        submit: {
          type: 'SubmitButton',
          props: { label: 'Send', actionId: 'ask_chat' },
          children: [],
        },
      },
    }
    const { container, onRunAction } = render({ spec })
    const form = container.querySelector('form')
    act(() => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(onRunAction).toHaveBeenCalledWith('ask_chat', expect.any(Object))
  })

  it('renders DataText markdown headings, emphasis, and lists', () => {
    const { container } = render({
      spec: replySpec,
      state: {
        output: {
          content: '## Summary\n\n**Bold** reply\n\n- first\n- second',
        },
      },
    })

    expect(container.querySelector('h2')?.textContent).toBe('Summary')
    expect(container.querySelector('strong')?.textContent).toContain('Bold')
    const items = Array.from(container.querySelectorAll('li')).map((item) => item.textContent)
    expect(items).toEqual(expect.arrayContaining(['first', 'second']))
  })

  it('renders the DataText fallback as plain text', () => {
    const { container } = render({ spec: replySpec, state: {} })
    expect(container.textContent).toContain('Waiting for a reply…')
    expect(container.querySelector('strong')).toBeNull()
  })

  it('renders the DataText fallback when content is an empty string', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: { title: 'Results' }, children: ['body'] },
        body: {
          type: 'DataText',
          props: { statePath: 'content', fallback: 'Waiting for a reply…' },
          children: [],
        },
      },
    }
    const { container } = render({ spec, state: { content: '' } })
    expect(container.textContent).toContain('Waiting for a reply…')
    expect(container.querySelector('[data-testid="skeleton"]')).toBeNull()
  })

  it('shows a DataText skeleton while pending when content is an empty string', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: { title: 'Results' }, children: ['body'] },
        body: {
          type: 'DataText',
          props: { statePath: 'content', fallback: 'Waiting for a reply…' },
          children: [],
        },
      },
    }
    const { container } = render({ spec, state: { content: '' }, pending: true })
    expect(container.querySelector('[data-testid="skeleton"]')).toBeTruthy()
    expect(container.textContent).not.toContain('Waiting for a reply…')
  })

  describe('Chat live content', () => {
    const chatSpec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: { title: 'Results' }, children: ['chat'] },
        chat: {
          type: 'Chat',
          props: { actionId: 'submit_lead', placeholder: 'Ask a follow-up' },
          children: [],
        },
      },
    }
    const protocol = { submit_lead: { input: true } }

    it('paints streamed content above the composer when the page has no DataText content', () => {
      const { container } = render({
        spec: chatSpec,
        state: { content: '## Hello stream' },
        actionChatProtocol: protocol,
      })

      expect(container.querySelector('[data-testid="generative-chat-transcript"]')).toBeTruthy()
      expect(container.querySelector('h2')?.textContent).toBe('Hello stream')
      expect(container.querySelector('[data-testid="generative-chat"]')).toBeTruthy()
    })

    it('shows the DataText skeleton above Chat while content is pending and empty', () => {
      const { container } = render({
        spec: chatSpec,
        state: {},
        pending: true,
        pendingActionIds: new Set(['submit_lead']),
        actionHostKeys: { submit_lead: ['content'] },
        actionChatProtocol: protocol,
      })

      const transcript = container.querySelector('[data-testid="generative-chat-transcript"]')
      expect(transcript).toBeTruthy()
      expect(transcript?.querySelector('[data-testid="skeleton"]')).toBeTruthy()
      expect(transcript?.querySelector('[aria-live="polite"][aria-busy="true"]')).toBeTruthy()
    })

    it('does not duplicate content when DataText already binds statePath content', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: { title: 'Results' }, children: ['body', 'chat'] },
          body: {
            type: 'DataText',
            props: { statePath: 'content', fallback: '' },
            children: [],
          },
          chat: {
            type: 'Chat',
            props: { actionId: 'submit_lead', placeholder: 'Ask a follow-up' },
            children: [],
          },
        },
      }
      const { container } = render({
        spec,
        state: { content: '## Hello stream' },
        actionChatProtocol: protocol,
      })

      expect(container.querySelector('[data-testid="generative-chat-transcript"]')).toBeNull()
      expect(container.querySelector('h2')?.textContent).toBe('Hello stream')
      expect(container.querySelector('[data-testid="generative-chat"]')).toBeTruthy()
    })

    it('hides the transcript when idle and content is empty', () => {
      const { container } = render({
        spec: chatSpec,
        state: {},
        actionChatProtocol: protocol,
      })

      expect(container.querySelector('[data-testid="generative-chat-transcript"]')).toBeNull()
      expect(container.querySelector('[data-testid="generative-chat"]')).toBeTruthy()
    })

    it('submits follow-ups as surface chat', () => {
      const { container, onRunAction } = render({
        spec: chatSpec,
        state: { content: '## Hello stream' },
        actionChatProtocol: protocol,
      })
      const textarea = container.querySelector(
        '[data-testid="generative-chat"] textarea'
      ) as HTMLTextAreaElement
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set

      act(() => {
        setter?.call(textarea, 'Follow up')
        textarea.dispatchEvent(new Event('input', { bubbles: true }))
      })
      act(() => {
        container
          .querySelector('[data-testid="generative-chat"]')
          ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      })

      expect(onRunAction).toHaveBeenCalledWith(
        'submit_lead',
        expect.objectContaining({ input: 'Follow up', conversationId: expect.any(String) }),
        { surface: 'chat' }
      )
    })

    it('renders appended chatTurns without dropping earlier messages', () => {
      const { container } = render({
        spec: chatSpec,
        state: {
          chatTurns: [
            { role: 'user', content: 'First' },
            { role: 'assistant', content: 'Reply one' },
            { role: 'user', content: 'Second' },
            { role: 'assistant', content: 'Reply two' },
          ],
        },
        actionChatProtocol: protocol,
      })

      const turns = Array.from(container.querySelectorAll('[data-testid="generative-chat-turn"]'))
      expect(turns).toHaveLength(4)
      expect(turns.map((node) => node.getAttribute('data-role'))).toEqual([
        'user',
        'assistant',
        'user',
        'assistant',
      ])
      expect(container.textContent).toContain('First')
      expect(container.textContent).toContain('Reply one')
      expect(container.textContent).toContain('Second')
      expect(container.textContent).toContain('Reply two')
    })

    it('hides DataText content when chatTurns are present so Chat owns the arena', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: { title: 'Results' }, children: ['body', 'chat'] },
          body: {
            type: 'DataText',
            props: { statePath: 'content', fallback: '' },
            children: [],
          },
          chat: {
            type: 'Chat',
            props: { actionId: 'submit_lead', placeholder: 'Ask a follow-up' },
            children: [],
          },
        },
      }
      const { container } = render({
        spec,
        state: {
          content: 'Latest only',
          chatTurns: [
            { role: 'user', content: 'First' },
            { role: 'assistant', content: 'Reply one' },
          ],
        },
        actionChatProtocol: protocol,
      })

      expect(container.querySelectorAll('[data-testid="generative-chat-turn"]')).toHaveLength(2)
      expect(container.textContent).toContain('First')
      expect(container.textContent).toContain('Reply one')
      const headings = container.querySelectorAll('h2')
      expect(headings.length).toBe(0)
    })
  })

  it('renders a markdown string when DataText is bound to field.content', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: { title: 'Results' }, children: ['body'] },
        body: {
          type: 'DataText',
          props: {
            statePath: 'artical_data.content',
            fallback: 'No recommendations yet',
          },
          children: [],
        },
      },
    }
    const { container } = render({
      spec,
      state: { artical_data: '# Root Canal Treatment' },
    })
    expect(container.textContent).toContain('Root Canal Treatment')
    expect(container.textContent).not.toContain('No recommendations yet')
  })

  it('renders nested output.content when DataText is bound to content', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: { title: 'Chat' }, children: ['reply'] },
        reply: {
          type: 'DataText',
          props: { statePath: 'content', fallback: 'Waiting…' },
          children: [],
        },
      },
    }
    const { container } = render({
      spec,
      state: { content: 'Hello from the model' },
    })
    expect(container.textContent).toContain('Hello from the model')
    expect(container.textContent).not.toContain('Waiting…')
  })

  it('renders an object DataText value as nested text, not [object Object]', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: { title: 'Chat' }, children: ['reply'] },
        reply: {
          type: 'DataText',
          props: { statePath: 'output', fallback: 'Waiting…' },
          children: [],
        },
      },
    }
    const { container } = render({
      spec,
      state: { output: { content: 'Nested reply' } },
    })
    expect(container.textContent).toContain('Nested reply')
    expect(container.textContent).not.toContain('[object Object]')
  })

  it('keeps a DataText JSON payload as prose, not a Table', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: { title: 'Report' }, children: ['body'] },
        body: {
          type: 'DataText',
          props: { statePath: 'content', fallback: 'Waiting…' },
          children: [],
        },
      },
    }
    const { container } = render({
      spec,
      state: {
        content: JSON.stringify(
          {
            companies: [{ id: '1441', industry: 'Software Development' }],
            tokens: { total: 10 },
            finishReason: 'stop',
          },
          null,
          2
        ),
      },
    })
    expect(container.querySelector('table')).toBeNull()
    expect(container.textContent).toContain('Software Development')
    expect(container.textContent).toContain('1441')
    expect(container.textContent).not.toContain('finishReason')
  })

  it('hides ProgressSteps when not pending', () => {
    const { container } = render({ spec: progressSpec, pending: false })
    expect(container.textContent).not.toContain('Connecting')
  })

  it('defaults Section to the wide cap and drops it for width full', () => {
    const sectionSpec = (width?: string): Spec => ({
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['section'] },
        section: { type: 'Section', props: width ? { width } : {}, children: [] },
      },
    })

    const wide = render({ spec: sectionSpec() })
    expect(wide.container.querySelector('section')?.className).toContain('max-w-[1280px]')
    unmount?.()
    unmount = undefined

    const full = render({ spec: sectionSpec('full') })
    expect(full.container.querySelector('section')?.className).toContain('max-w-none')
    expect(full.container.querySelector('section')?.className).not.toContain('max-w-[1280px]')
  })

  it('renders Grid with auto-fit template columns sized from columns', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['grid'] },
        grid: { type: 'Grid', props: { columns: '3' }, children: ['card'] },
        card: { type: 'Card', props: { title: 'Item' }, children: [] },
      },
    }
    const { container } = render({ spec })
    const grid = container.querySelector('.grid') as HTMLElement
    expect(grid.style.gridTemplateColumns).toBe('repeat(auto-fit, minmax(min(100%, 300px), 1fr))')
  })

  it('renders a two-column Grid inside Form as equal tracks and drops the form measure', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['form'] },
        form: { type: 'Form', props: { actionId: 'generate' }, children: ['grid', 'submit'] },
        grid: {
          type: 'Grid',
          props: { columns: '2' },
          children: ['keyword', 'client'],
        },
        keyword: {
          type: 'TextInput',
          props: { name: 'keyword', label: 'Keyword' },
          children: [],
        },
        client: {
          type: 'TextInput',
          props: { name: 'client', label: 'Client' },
          children: [],
        },
        submit: { type: 'SubmitButton', props: { label: 'Generate' }, children: [] },
      },
    }
    const { container } = render({ spec })
    const form = container.querySelector('form')
    expect(form?.className).not.toContain('max-w-[var(--gui-measure')
    const grid = container.querySelector('.grid') as HTMLElement
    expect(grid.className).toContain('md:grid-cols-2')
    expect(grid.style.gridTemplateColumns).toBe('')
  })

  it('makes a Card a direct child of a horizontal Stack instead of wrapping it in a span', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['stack'] },
        stack: {
          type: 'Stack',
          props: { direction: 'horizontal', justify: 'between', wrap: true },
          children: ['card'],
        },
        card: { type: 'Card', props: { title: 'Item' }, children: [] },
      },
    }
    const { container } = render({ spec })
    const stack = container.querySelector('.flex-row') as HTMLElement
    expect(stack.className).toContain('justify-between')
    expect(stack.className).toContain('flex-wrap')
    expect(container.querySelector('span > div')).toBeNull()
    expect(stack.firstElementChild?.tagName).toBe('DIV')
    expect(stack.firstElementChild?.textContent).toContain('Item')
  })

  it('renders Table rows from a statePath array', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['table'] },
        table: {
          type: 'Table',
          props: { columns: 'title, score', statePath: 'output.items' },
          children: [],
        },
      },
    }
    const { container } = render({
      spec,
      state: {
        output: {
          items: [
            { title: 'First', score: 9 },
            { title: 'Second', score: 4 },
          ],
        },
      },
    })
    const headers = Array.from(container.querySelectorAll('th')).map((cell) => cell.textContent)
    expect(headers).toEqual(['title', 'score'])
    const rows = Array.from(container.querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent)
    )
    expect(rows).toEqual([
      ['First', '9'],
      ['Second', '4'],
    ])
  })

  it('renders static Table rows split on the pipe separator', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['table'] },
        table: {
          type: 'Table',
          props: { columns: 'Name, Role', rows: 'Ada | Engineer\nGrace | Admiral' },
          children: [],
        },
      },
    }
    const { container } = render({ spec })
    const rows = Array.from(container.querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent)
    )
    expect(rows).toEqual([
      ['Ada', 'Engineer'],
      ['Grace', 'Admiral'],
    ])
  })

  it('renders host rows on a sole Table that authored rows without statePath', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['table'] },
        table: {
          type: 'Table',
          props: { columns: 'Name, Role', rows: 'Ada | Engineer' },
          children: [],
        },
      },
    }
    const { container } = render({
      spec,
      state: {
        rows: [
          { Name: 'Ada', Role: 'Engineer' },
          { Name: 'Alan', Role: 'Cryptanalyst' },
        ],
      },
    })
    const rows = Array.from(container.querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent)
    )
    expect(rows).toEqual([
      ['Ada', 'Engineer'],
      ['Alan', 'Cryptanalyst'],
    ])
  })

  it('renders host rows on an unpathed Table beside a Repeat collection', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['list', 'table'] },
        list: { type: 'Repeat', props: { statePath: 'projects' }, children: ['card'] },
        card: { type: 'Card', props: { title: '{item.name}' }, children: [] },
        table: {
          type: 'Table',
          props: { columns: 'Name, Role', rows: 'Ada | Engineer' },
          children: [],
        },
      },
    }
    const { container } = render({
      spec,
      state: {
        projects: [{ id: 'p1', name: 'Alpha' }],
        rows: [
          { Name: 'Ada', Role: 'Engineer' },
          { Name: 'Alan', Role: 'Cryptanalyst' },
        ],
      },
    })
    const rows = Array.from(container.querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent)
    )
    expect(rows).toEqual([
      ['Ada', 'Engineer'],
      ['Alan', 'Cryptanalyst'],
    ])
  })

  it('filters static Table rows locally when SearchField has no actionId', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['search', 'hint', 'table'] },
        search: {
          type: 'SearchField',
          props: { name: 'query', placeholder: 'Search tasks...', submitLabel: 'Search' },
          children: [],
        },
        hint: {
          type: 'Chip',
          props: { text: 'pull', setValue: 'query=pull' },
          children: [],
        },
        table: {
          type: 'Table',
          props: {
            columns: 'TASK, STATUS',
            rows: 'Prepare Q3 budget report | Active\nReview pull requests | Active\nSchedule team standup | Completed',
            emptyText: 'No matching tasks.',
          },
          children: [],
        },
      },
    }
    const { container, onRunAction } = render({ spec })
    const chip = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'pull'
    )
    act(() => {
      chip?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const rows = Array.from(container.querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent)
    )
    expect(rows).toEqual([['Review pull requests', 'Active']])
    expect(onRunAction).not.toHaveBeenCalled()
  })

  it('filters static Table rows locally when a Filter Select changes', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['filters', 'table'] },
        filters: { type: 'Filter', props: {}, children: ['status'] },
        status: {
          type: 'Select',
          props: { name: 'status', label: 'Status', options: 'All,Active,Completed' },
          children: [],
        },
        table: {
          type: 'Table',
          props: {
            columns: 'TASK, STATUS',
            rows: 'Prepare Q3 budget report | Active\nSchedule team standup | Completed',
          },
          children: [],
        },
      },
    }
    const { container } = render({ spec })
    const select = container.querySelector('select[name="status"]') as HTMLSelectElement
    act(() => {
      select.value = 'Completed'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const rows = Array.from(container.querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent)
    )
    expect(rows).toEqual([['Schedule team standup', 'Completed']])
  })

  it('does not locally filter when SearchField actionId is a known host action', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['search', 'hint', 'table'] },
        search: {
          type: 'SearchField',
          props: { name: 'query', actionId: 'search_tasks', submitLabel: 'Search' },
          children: [],
        },
        hint: {
          type: 'Chip',
          props: { text: 'pull', setValue: 'query=pull' },
          children: [],
        },
        table: {
          type: 'Table',
          props: {
            columns: 'TASK',
            rows: 'Prepare Q3 budget report\nReview pull requests',
          },
          children: [],
        },
      },
    }
    const { container } = render({
      spec,
      actionHostKeys: { search_tasks: ['tasks'] },
    })
    const chip = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'pull'
    )
    act(() => {
      chip?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    const rows = Array.from(container.querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent)
    )
    expect(rows).toEqual([['Prepare Q3 budget report'], ['Review pull requests']])
  })

  it('pages a bound Table locally when there is no pagination API', () => {
    const items = Array.from({ length: 25 }, (_, index) => ({
      title: `Row ${index + 1}`,
      score: index + 1,
    }))
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['table'] },
        table: {
          type: 'Table',
          props: { columns: 'title, score', statePath: 'items' },
          children: [],
        },
      },
    }
    const { container } = render({ spec, state: { items } })
    const cellText = () =>
      Array.from(container.querySelectorAll('tbody tr')).map((row) =>
        Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent)
      )
    expect(cellText()).toHaveLength(20)
    expect(cellText()[0]).toEqual(['Row 1', '1'])
    expect(cellText()[19]).toEqual(['Row 20', '20'])
    expect(container.textContent).toContain('Showing 1–20 of 25')
    const next = container.querySelector('[aria-label="Next page"]') as HTMLButtonElement
    expect(next).toBeTruthy()
    expect(container.querySelector('[aria-label="Previous page"]')).toHaveProperty('disabled', true)
    act(() => {
      next.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(cellText()).toEqual([
      ['Row 21', '21'],
      ['Row 22', '22'],
      ['Row 23', '23'],
      ['Row 24', '24'],
      ['Row 25', '25'],
    ])
    expect(container.textContent).toContain('Showing 21–25 of 25')
    expect(container.querySelector('[aria-label="Next page"]')).toHaveProperty('disabled', true)
  })

  it('hides the local Table pager when a filter leaves a short list', () => {
    const items = [
      ...Array.from({ length: 22 }, (_, index) => ({
        title: `Active ${index + 1}`,
        status: 'Active',
      })),
      { title: 'Done A', status: 'Completed' },
      { title: 'Done B', status: 'Completed' },
      { title: 'Done C', status: 'Completed' },
    ]
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['filters', 'table'] },
        filters: { type: 'Filter', props: {}, children: ['status'] },
        status: {
          type: 'Select',
          props: { name: 'status', label: 'Status', options: 'All,Active,Completed' },
          children: [],
        },
        table: {
          type: 'Table',
          props: { columns: 'title, status', statePath: 'items' },
          children: [],
        },
      },
    }
    const { container } = render({ spec, state: { items } })
    expect(container.querySelectorAll('tbody tr')).toHaveLength(20)
    expect(container.querySelector('[aria-label="Next page"]')).toBeTruthy()
    const select = container.querySelector('select[name="status"]') as HTMLSelectElement
    act(() => {
      select.value = 'Completed'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    const rows = Array.from(container.querySelectorAll('tbody tr')).map((row) =>
      Array.from(row.querySelectorAll('td')).map((cell) => cell.textContent)
    )
    expect(rows).toEqual([
      ['Done A', 'Completed'],
      ['Done B', 'Completed'],
      ['Done C', 'Completed'],
    ])
    expect(container.querySelector('[aria-label="Next page"]')).toBeNull()
    expect(container.textContent).not.toContain('Showing')
  })

  it('does not locally page a Table when actionHostKeys include hasMore', () => {
    const items = Array.from({ length: 25 }, (_, index) => ({
      title: `Row ${index + 1}`,
    }))
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['table'] },
        table: {
          type: 'Table',
          props: { columns: 'title', statePath: 'items' },
          children: [],
        },
      },
    }
    const { container } = render({
      spec,
      state: { items, hasMore: true },
      actionHostKeys: { load_list: ['items', 'hasMore'] },
    })
    expect(container.querySelectorAll('tbody tr')).toHaveLength(25)
    expect(container.querySelector('[aria-label="Next page"]')).toBeNull()
    expect(container.textContent).not.toContain('Showing')
  })

  describe('Repeat', () => {
    const articles = [
      { id: 'a1', title: 'First', score: 9, url: 'https://example.com/a' },
      { id: 'a2', title: 'Second', score: 4, url: 'https://example.com/b' },
    ]

    const repeatSpec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['grid'] },
        grid: { type: 'Grid', props: { columns: '2' }, children: ['repeat'] },
        repeat: { type: 'Repeat', props: { statePath: 'articles' }, children: ['card'] },
        card: {
          type: 'Card',
          props: { title: '{item.title}' },
          children: ['open', 'score'],
        },
        open: {
          type: 'NavLink',
          props: { label: 'Open', to: 'article?id={item.id}' },
          children: [],
        },
        score: {
          type: 'DataText',
          props: { statePath: 'item.score' },
          children: [],
        },
      },
    }

    it('renders one Card per array item as a Grid item', () => {
      const { container } = render({ spec: repeatSpec, state: { articles } })
      const grid = container.querySelector('.grid') as HTMLElement
      const wrapper = grid.firstElementChild as HTMLElement
      expect(wrapper.className).toContain('contents')
      const cards = Array.from(wrapper.children)
      expect(cards).toHaveLength(2)
      expect(cards[0]?.querySelector('h2')?.textContent).toBe('First')
      expect(cards[1]?.querySelector('h2')?.textContent).toBe('Second')
      expect(container.textContent).toContain('9')
      expect(container.textContent).toContain('4')
    })

    it('pages locally when there is no pagination API', () => {
      const manyArticles = Array.from({ length: 25 }, (_, index) => ({
        id: `a${index + 1}`,
        title: `Card ${index + 1}`,
        score: index + 1,
        url: `https://example.com/${index + 1}`,
      }))
      const { container } = render({ spec: repeatSpec, state: { articles: manyArticles } })
      const grid = container.querySelector('.grid') as HTMLElement
      const wrapper = grid.firstElementChild as HTMLElement
      expect(Array.from(wrapper.children)).toHaveLength(20)
      expect(wrapper.children[0]?.querySelector('h2')?.textContent).toBe('Card 1')
      expect(wrapper.children[19]?.querySelector('h2')?.textContent).toBe('Card 20')
      expect(container.textContent).toContain('Showing 1–20 of 25')
      const next = container.querySelector('[aria-label="Next page"]') as HTMLButtonElement
      act(() => {
        next.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      const pagedWrapper = (container.querySelector('.grid') as HTMLElement)
        .firstElementChild as HTMLElement
      expect(Array.from(pagedWrapper.children)).toHaveLength(5)
      expect(pagedWrapper.children[0]?.querySelector('h2')?.textContent).toBe('Card 21')
      expect(pagedWrapper.children[4]?.querySelector('h2')?.textContent).toBe('Card 25')
      expect(container.textContent).toContain('Showing 21–25 of 25')
    })

    it('interpolates the row id into in-app navigation so onLoad can fetch that record', () => {
      const { container, onNavigate } = render({ spec: repeatSpec, state: { articles } })
      const links = Array.from(container.querySelectorAll('button')).filter(
        (button) => button.textContent === 'Open'
      )
      act(() => {
        links[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onNavigate).toHaveBeenCalledWith('article?id=a2')
    })

    it('sends the row fields when a Button inside Repeat runs an action', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['repeat'] },
          repeat: { type: 'Repeat', props: { statePath: 'articles' }, children: ['run'] },
          run: {
            type: 'Button',
            props: { label: 'Save', actionId: 'save_article' },
            children: [],
          },
        },
      }
      const { container, onRunAction } = render({ spec, state: { articles } })
      const buttons = Array.from(container.querySelectorAll('button')).filter(
        (button) => button.textContent === 'Save'
      )
      act(() => {
        buttons[0]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onRunAction).toHaveBeenCalledWith(
        'save_article',
        expect.objectContaining({ id: 'a1', title: 'First' })
      )
    })

    it('copies the Repeat row when selectItem is set and does not run an action', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['repeat'] },
          repeat: { type: 'Repeat', props: { statePath: 'articles' }, children: ['open'] },
          open: {
            type: 'Button',
            props: { label: 'Open', selectItem: true, navigateTo: 'results' },
            children: [],
          },
        },
      }
      const { container, onNavigate, onRunAction, onSelectItem } = render({
        spec,
        state: { articles },
      })
      const buttons = Array.from(container.querySelectorAll('button')).filter(
        (button) => button.textContent === 'Open'
      )
      act(() => {
        buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onSelectItem).toHaveBeenCalledWith(articles[1], 1)
      expect(onNavigate).toHaveBeenCalledWith('results')
      expect(onRunAction).not.toHaveBeenCalled()
    })

    it('selects the Repeat row when setValue opens the editing overlay', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['repeat'] },
          repeat: { type: 'Repeat', props: { statePath: 'articles' }, children: ['edit'] },
          edit: {
            type: 'Button',
            props: { label: 'Edit', setValue: 'editing=true' },
            children: [],
          },
        },
      }
      const { container, onSelectItem, onRunAction } = render({ spec, state: { articles } })
      const buttons = Array.from(container.querySelectorAll('button')).filter(
        (button) => button.textContent === 'Edit'
      )
      act(() => {
        buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onSelectItem).toHaveBeenCalledWith(articles[1], 1)
      expect(onRunAction).not.toHaveBeenCalled()
    })

    it('hides DataText until showWhen selectedId matches', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['body'] },
          body: {
            type: 'DataText',
            props: { statePath: 'content', fallback: '', showWhen: 'selectedId' },
            children: [],
          },
        },
      }
      const hidden = render({ spec, state: { content: '# Hidden report' } })
      expect(hidden.container.textContent).not.toContain('Hidden report')
      unmount?.()

      const shown = render({
        spec,
        state: { content: '# Hidden report', selectedId: 'run_1' },
      })
      expect(shown.container.textContent).toContain('Hidden report')
    })

    it('hides Repeat on a same-page selectItem page while selectedId is set', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['repeat', 'detail'] },
          repeat: { type: 'Repeat', props: { statePath: 'articles' }, children: ['open'] },
          open: {
            type: 'Button',
            props: { label: 'Open', selectItem: true },
            children: [],
          },
          detail: {
            type: 'DataText',
            props: { statePath: 'content', fallback: '', showWhen: 'selectedId' },
            children: [],
          },
        },
      }
      const list = render({ spec, state: { articles }, currentPath: 'history' })
      expect(list.container.textContent).toContain('Open')
      expect(list.container.textContent).not.toContain('Hidden report')
      unmount?.()

      const detail = render({
        spec,
        state: { articles, selectedId: 'a1', content: '# Hidden report' },
        currentPath: 'history',
      })
      expect(detail.container.textContent).not.toContain('Open')
      expect(detail.container.textContent).toContain('Hidden report')
    })

    it('keeps a Workspace Repeat visible while selectedId is set', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['shell'] },
          shell: {
            type: 'Workspace',
            props: { inspectorWhen: 'selectedId' },
            children: ['navigator', 'primary', 'inspector'],
          },
          navigator: { type: 'Stack', props: {}, children: ['repeat'] },
          repeat: { type: 'Repeat', props: { statePath: 'projects' }, children: ['open'] },
          open: { type: 'Button', props: { label: 'Open', selectItem: true }, children: [] },
          primary: { type: 'Stack', props: {}, children: ['heading'] },
          heading: { type: 'Text', props: { text: 'Tasks stay here' }, children: [] },
          inspector: {
            type: 'DataText',
            props: { statePath: 'content', fallback: 'Select a project.' },
            children: [],
          },
        },
      }
      const { container } = render({
        spec,
        currentPath: 'home',
        state: {
          projects: [{ id: 'p1', name: 'Alpha' }],
          selectedId: 'p1',
          content: 'Project notes',
        },
      })
      expect(container.textContent).toContain('Open')
      expect(container.textContent).toContain('Tasks stay here')
      expect(container.textContent).toContain('Project notes')
    })

    it('narrows a Workspace sibling collection to the selected row', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['shell'] },
          shell: {
            type: 'Workspace',
            props: { inspectorWhen: 'selectedId' },
            children: ['navigator', 'primary'],
          },
          navigator: { type: 'Stack', props: {}, children: ['projects'] },
          projects: { type: 'Repeat', props: { statePath: 'projects' }, children: ['open'] },
          open: { type: 'Button', props: { label: 'Open', selectItem: true }, children: [] },
          primary: { type: 'Stack', props: {}, children: ['tasks'] },
          tasks: { type: 'Repeat', props: { statePath: 'tasks' }, children: ['card'] },
          card: { type: 'Card', props: { title: '{item.name}' }, children: [] },
        },
      }
      const { container } = render({
        spec,
        currentPath: 'home',
        state: {
          projects: [
            { id: 'p1', name: 'Alpha' },
            { id: 'p2', name: 'Beta' },
          ],
          tasks: [
            { id: 't1', name: 'Ship Alpha', projectId: 'p1' },
            { id: 't2', name: 'Plan Beta', projectId: 'p2' },
          ],
          selectedId: 'p1',
        },
      })
      expect(container.textContent).toContain('Open')
      expect(container.textContent).toContain('Ship Alpha')
      expect(container.textContent).not.toContain('Plan Beta')
    })

    it('keeps Columns-as-Workspace lists visible and filters the sibling collection', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['columns'] },
          columns: {
            type: 'Columns',
            props: { layout: 'sidebar-left' },
            children: ['projects', 'tasks'],
          },
          projects: { type: 'Repeat', props: { statePath: 'projects' }, children: ['open'] },
          open: { type: 'Button', props: { label: 'Open', selectItem: true }, children: [] },
          tasks: { type: 'Repeat', props: { statePath: 'tasks' }, children: ['card'] },
          card: { type: 'Card', props: { title: '{item.name}' }, children: [] },
        },
      }
      const { container } = render({
        spec,
        currentPath: 'home',
        state: {
          projects: [{ id: 'p1', name: 'Alpha' }],
          tasks: [
            { id: 't1', name: 'Ship Alpha', projectId: 'p1' },
            { id: 't2', name: 'Plan Beta', projectId: 'p2' },
          ],
          selectedId: 'p1',
        },
      })
      expect(container.textContent).toContain('Open')
      expect(container.textContent).toContain('Ship Alpha')
      expect(container.textContent).not.toContain('Plan Beta')
    })

    it('lifts Table.rows into Repeat when both share a statePath', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['tasks', 'table'] },
          tasks: { type: 'Repeat', props: { statePath: 'tasks' }, children: ['card'] },
          card: { type: 'Card', props: { title: '{item.Name}' }, children: [] },
          table: {
            type: 'Table',
            props: {
              statePath: 'tasks',
              columns: 'Id, Name',
              rows: 't1 | Ship Alpha',
            },
            children: [],
          },
        },
      }
      const { container } = render({ spec, currentPath: 'home', state: {} })
      expect(container.textContent).toContain('Ship Alpha')
    })

    it('narrows dummy Workspace Table.rows by Project Id', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['shell'] },
          shell: {
            type: 'Workspace',
            props: { inspectorWhen: 'selectedId' },
            children: ['navigator', 'primary'],
          },
          navigator: { type: 'Stack', props: {}, children: ['projects'] },
          projects: { type: 'Repeat', props: { statePath: 'projects' }, children: ['open'] },
          open: { type: 'Button', props: { label: 'Open', selectItem: true }, children: [] },
          primary: { type: 'Stack', props: {}, children: ['table'] },
          table: {
            type: 'Table',
            props: {
              columns: 'Id, Name, Project Id',
              rows: 't1 | Ship Alpha | p1\nt2 | Plan Beta | p2\nt3 | Review Alpha | p1',
            },
            children: [],
          },
        },
      }
      const { container } = render({
        spec,
        currentPath: 'home',
        state: {
          projects: [{ id: 'p1', name: 'Alpha' }],
          selectedId: 'p1',
        },
      })
      const names = Array.from(container.querySelectorAll('tbody tr')).map(
        (row) => row.querySelectorAll('td')[1]?.textContent
      )
      expect(names).toEqual(['Ship Alpha', 'Review Alpha'])
    })

    it('keeps the Workspace parent filter after a child row is selected', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['shell'] },
          shell: {
            type: 'Workspace',
            props: { inspectorWhen: 'selectedId' },
            children: ['navigator', 'primary'],
          },
          navigator: { type: 'Stack', props: {}, children: ['projects'] },
          projects: { type: 'Repeat', props: { statePath: 'projects' }, children: ['open'] },
          open: { type: 'Button', props: { label: 'Open', selectItem: true }, children: [] },
          primary: { type: 'Stack', props: {}, children: ['tasks'] },
          tasks: { type: 'Repeat', props: { statePath: 'tasks' }, children: ['card'] },
          card: { type: 'Card', props: { title: '{item.name}' }, children: [] },
        },
      }
      const { container } = render({
        spec,
        currentPath: 'home',
        state: {
          projects: [
            { id: 'p1', name: 'Alpha' },
            { id: 'p2', name: 'Beta' },
          ],
          tasks: [
            { id: 't1', name: 'Ship Alpha', projectId: 'p1' },
            { id: 't2', name: 'Plan Beta', projectId: 'p2' },
            { id: 't3', name: 'Review Alpha', projectId: 'p1' },
          ],
          selectedId: 't1',
          selected: { id: 't1', name: 'Ship Alpha', projectId: 'p1' },
        },
      })
      expect(container.textContent).toContain('Ship Alpha')
      expect(container.textContent).toContain('Review Alpha')
      expect(container.textContent).not.toContain('Plan Beta')
    })

    it('keeps a Drawer inspect collection visible while selectedId is set', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['repeat', 'drawer'] },
          repeat: { type: 'Repeat', props: { statePath: 'tasks' }, children: ['open'] },
          open: { type: 'Button', props: { label: 'Open', selectItem: true }, children: [] },
          drawer: {
            type: 'Drawer',
            props: { showWhen: 'selectedId' },
            children: ['body'],
          },
          body: {
            type: 'DataText',
            props: { statePath: 'content', fallback: '' },
            children: [],
          },
        },
      }
      const { container } = render({
        spec,
        currentPath: 'home',
        state: {
          tasks: [{ id: 't1', name: 'Ship' }],
          selectedId: 't1',
          content: 'Task detail',
        },
      })
      expect(container.textContent).toContain('Open')
      expect(container.textContent).toContain('Task detail')
    })

    it('compiles a missed same-page Open so markdown is not under the list', () => {
      const authored: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['repeat', 'body'] },
          repeat: { type: 'Repeat', props: { statePath: 'articles' }, children: ['open'] },
          open: {
            type: 'Button',
            props: { label: 'Open', selectItem: true },
            children: [],
          },
          body: {
            type: 'DataText',
            props: { statePath: 'content', fallback: '' },
            children: [],
          },
        },
      }
      const spec = injectSamePageSelectChrome(authored, 'history')
      const list = render({
        spec,
        state: { articles, content: '# Hidden report' },
        currentPath: 'history',
      })
      expect(list.container.textContent).toContain('Open')
      expect(list.container.textContent).not.toContain('Hidden report')
      expect(list.container.textContent).not.toContain('Back')
      unmount?.()

      const detail = render({
        spec,
        state: { articles, selectedId: 'a1', content: '# Hidden report' },
        currentPath: 'history',
      })
      expect(detail.container.textContent).not.toContain('Open')
      expect(detail.container.textContent).toContain('Hidden report')
      expect(detail.container.textContent).toContain('Back')
    })

    it('calls onClearItem instead of onNavigate when Back targets the current path', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['repeat', 'back'] },
          repeat: { type: 'Repeat', props: { statePath: 'articles' }, children: ['open'] },
          open: {
            type: 'Button',
            props: { label: 'Open', selectItem: true },
            children: [],
          },
          back: {
            type: 'Button',
            props: { label: 'Back to history', navigateTo: 'history' },
            children: [],
          },
        },
      }
      const { container, onNavigate, onClearItem } = render({
        spec,
        state: { articles, selectedId: 'a1' },
        currentPath: 'history',
      })
      const back = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'Back to history'
      )
      act(() => {
        back?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onClearItem).toHaveBeenCalledTimes(1)
      expect(onNavigate).not.toHaveBeenCalled()
    })

    it('calls onClearItem for a NavLink to the current path while a row is selected', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['repeat', 'back'] },
          repeat: { type: 'Repeat', props: { statePath: 'articles' }, children: ['open'] },
          open: {
            type: 'Button',
            props: { label: 'Open', selectItem: true },
            children: [],
          },
          back: {
            type: 'NavLink',
            props: { label: 'Back to history', to: 'history' },
            children: [],
          },
        },
      }
      const { container, onNavigate, onClearItem } = render({
        spec,
        state: { articles, selectedId: 'a1' },
        currentPath: 'history',
      })
      const back = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'Back to history'
      )
      act(() => {
        back?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onClearItem).toHaveBeenCalledTimes(1)
      expect(onNavigate).not.toHaveBeenCalled()
    })

    it('clears the copied row when clearItem is set', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['back'] },
          back: {
            type: 'Button',
            props: { label: 'Back', clearItem: true, showWhen: 'selectedId' },
            children: [],
          },
        },
      }
      const hidden = render({ spec, state: {} })
      expect(hidden.container.textContent).not.toContain('Back')
      unmount?.()

      const { container, onClearItem, onNavigate } = render({
        spec,
        state: { selectedId: 'run_1' },
      })
      const back = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'Back'
      )
      act(() => {
        back?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onClearItem).toHaveBeenCalledTimes(1)
      expect(onNavigate).not.toHaveBeenCalled()
    })

    it('hides a list Section with showWhen !selectedId while a row is selected', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['list', 'detail'] },
          list: {
            type: 'Section',
            props: { showWhen: '!selectedId' },
            children: ['repeat'],
          },
          repeat: { type: 'Repeat', props: { statePath: 'articles' }, children: ['card'] },
          card: { type: 'Card', props: { title: '{item.title}' }, children: [] },
          detail: {
            type: 'DataText',
            props: { statePath: 'content', fallback: '', showWhen: 'selectedId' },
            children: [],
          },
        },
      }
      const shown = render({ spec, state: { articles } })
      expect(shown.container.textContent).toContain('First')
      unmount?.()

      const hidden = render({
        spec,
        state: { articles, selectedId: 'a1', content: '# Report' },
      })
      expect(hidden.container.textContent).not.toContain('First')
      expect(hidden.container.textContent).toContain('Report')
    })

    it('hides Repeat, Stack, and Grid when showWhen !selectedId matches', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['stack'] },
          stack: {
            type: 'Stack',
            props: { showWhen: '!selectedId' },
            children: ['grid'],
          },
          grid: {
            type: 'Grid',
            props: { showWhen: '!selectedId' },
            children: ['repeat'],
          },
          repeat: {
            type: 'Repeat',
            props: { statePath: 'articles', showWhen: '!selectedId' },
            children: ['card'],
          },
          card: { type: 'Card', props: { title: '{item.title}' }, children: [] },
        },
      }
      const shown = render({ spec, state: { articles } })
      expect(shown.container.textContent).toContain('First')
      unmount?.()

      const hidden = render({
        spec,
        state: { articles, selectedId: 'a1' },
      })
      expect(hidden.container.textContent).not.toContain('First')
    })

    it('renders Repeat rows from nested run_data.history and item.input fields', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['repeat'] },
          repeat: { type: 'Repeat', props: { statePath: 'run_data' }, children: ['card'] },
          card: { type: 'Card', props: { title: '{item.keyword}' }, children: [] },
        },
      }
      const { container } = render({
        spec,
        pending: false,
        state: {
          run_data: {
            history: [
              {
                id: 'h1',
                input: { keyword: 'Dental Implants', client: 'Gentle Dental' },
                createdAt: '2026-08-24T06:28:56.717Z',
              },
            ],
          },
        },
      })
      expect(container.querySelector('[data-testid="empty-state"]')).toBeNull()
      expect(container.querySelector('h2')?.textContent).toBe('Dental Implants')
    })

    it('pages a large array so the page cannot mount thousands of Cards', () => {
      const items = Array.from({ length: 60 }, (_, index) => ({
        id: `n${index}`,
        title: `Item ${index}`,
      }))
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['repeat'] },
          repeat: { type: 'Repeat', props: { statePath: 'items' }, children: ['card'] },
          card: { type: 'Card', props: { title: '{item.title}' }, children: [] },
        },
      }
      const { container } = render({ spec, state: { items } })
      expect(container.querySelectorAll('h2')).toHaveLength(20)
      expect(container.textContent).toContain('Showing 1–20 of 60')
      expect(container.querySelector('[aria-label="Next page"]')).toBeTruthy()
    })

    it('lets an inner Repeat bind to item.comments on the outer row', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['posts'] },
          posts: { type: 'Repeat', props: { statePath: 'posts' }, children: ['post'] },
          post: { type: 'Card', props: { title: '{item.title}' }, children: ['comments'] },
          comments: { type: 'Repeat', props: { statePath: 'item.comments' }, children: ['note'] },
          note: { type: 'Text', props: { text: '{item}' }, children: [] },
        },
      }
      const { container } = render({
        spec,
        state: { posts: [{ title: 'Hello', comments: ['nice', 'meh'] }] },
      })
      expect(container.querySelector('h2')?.textContent).toBe('Hello')
      expect(container.textContent).toContain('nice')
      expect(container.textContent).toContain('meh')
    })

    it('shows No results when the array is empty and nothing is pending', () => {
      const { container } = render({ spec: repeatSpec, pending: false, state: { articles: [] } })
      expect(container.querySelector('[data-testid="empty-state"]')?.textContent).toBe('No results')
      expect(container.querySelector('h2')).toBeNull()
    })

    it('uses emptyText when the collection is empty', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['repeat'] },
          repeat: {
            type: 'Repeat',
            props: { statePath: 'articles', emptyText: 'No matching articles' },
            children: ['card'],
          },
          card: { type: 'Card', props: { title: '{item.title}' }, children: [] },
        },
      }
      const { container } = render({ spec, pending: false, state: { articles: [] } })
      expect(container.querySelector('[data-testid="empty-state"]')?.textContent).toBe(
        'No matching articles'
      )
    })

    it('keeps the skeleton while pending so an empty array is not a false zero-result', () => {
      const { container } = render({ spec: repeatSpec, pending: true, state: { articles: [] } })
      expect(container.querySelector('[data-testid="empty-state"]')).toBeNull()
      expect(container.querySelectorAll('[data-testid="skeleton"]').length).toBeGreaterThan(0)
    })
  })

  it('navigates to the Tabs item path and marks the active tab', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['tabs'] },
        tabs: {
          type: 'Tabs',
          props: { items: 'Home|home\nReports|reports', activePath: 'home' },
          children: [],
        },
      },
    }
    const { container, onNavigate, onClearSelection } = render({
      spec,
      currentPath: 'home',
      state: { selectedId: 'run_1', content: '# Kept' },
    })
    const buttons = Array.from(container.querySelectorAll('nav button'))
    expect(buttons.map((button) => button.textContent)).toEqual(['Home', 'Reports'])
    expect(buttons[0]?.className).toContain('font-medium')
    expect(buttons[0]?.getAttribute('aria-current')).toBe('page')
    expect(buttons[1]?.getAttribute('aria-current')).toBeNull()
    act(() => {
      buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(onClearSelection).toHaveBeenCalled()
    expect(onNavigate).toHaveBeenCalledWith('reports')
  })

  it('renders PageHeader title, subtitle, and trailing action', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['header'] },
        header: {
          type: 'PageHeader',
          props: { title: 'Recommendations', subtitle: 'Ranked for you' },
          children: ['cta'],
        },
        cta: { type: 'Button', props: { label: 'Refresh', navigateTo: 'home' }, children: [] },
      },
    }
    const { container } = render({ spec })
    expect(container.querySelector('h1')?.textContent).toBe('Recommendations')
    expect(container.textContent).toContain('Ranked for you')
    expect(container.textContent).toContain('Refresh')
  })

  it('renders AppHeader as a sticky full-bleed bar with the Arena logo and title', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['chrome', 'section'] },
        chrome: {
          type: 'AppHeader',
          props: { title: 'Company Research AI', icon: 'spark' },
          children: [],
        },
        section: {
          type: 'Section',
          props: { width: 'wide' },
          children: ['hero'],
        },
        hero: {
          type: 'PageHeader',
          props: { title: 'Research any company', align: 'center' },
          children: [],
        },
      },
    }
    const { container } = render({ spec })
    const header = container.querySelector('[data-testid="app-header"]') as HTMLElement
    expect(header).toBeTruthy()
    expect(header.textContent).toContain('Company Research AI')
    expect(header.className).toContain('sticky')
    expect(header.className).toContain('top-0')
    expect(header.className).toContain('z-20')
    expect(header.className).toContain('bg-[var(--gui-surface,#ffffff)]')
    expect(header.querySelector('[data-testid="app-header-logo"]')).toBeTruthy()
    expect(header.querySelector('[data-testid="app-header-mark"]')).toBeNull()
    const inner = header.firstElementChild as HTMLElement
    expect(inner?.className).toContain('px-4')
    const section = container.querySelector('section')
    expect(section?.contains(header)).toBe(false)
    expect(container.querySelector('h1')?.textContent).toBe('Research any company')
  })

  it('hoists a brand row out of Section so it cannot sit under scrolling content', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['section'] },
        section: {
          type: 'Section',
          props: { width: 'wide' },
          children: ['brand', 'hero'],
        },
        brand: {
          type: 'Stack',
          props: { direction: 'horizontal', align: 'center', justify: 'between', gap: 'sm' },
          children: ['logo', 'name'],
        },
        logo: { type: 'Icon', props: { name: 'spark', well: 'square' }, children: [] },
        name: {
          type: 'Heading',
          props: { text: 'Company Research AI', level: 'h2' },
          children: [],
        },
        hero: {
          type: 'PageHeader',
          props: { title: 'Research any company', align: 'center' },
          children: [],
        },
      },
    }
    const { container } = render({ spec })
    const header = container.querySelector('[data-testid="app-header"]') as HTMLElement
    expect(header).toBeTruthy()
    expect(header.className).toContain('sticky')
    expect(header.className).toContain('z-20')
    expect(header.textContent).toContain('Company Research AI')
    expect(header.querySelector('[data-testid="app-header-logo"]')).toBeTruthy()
    const section = container.querySelector('section')
    expect(section?.contains(header)).toBe(false)
    expect(section?.textContent).toContain('Research any company')
    expect(section?.querySelector('h2')).toBeNull()
  })

  it('renders Stat and KeyValue values from host state', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['stat', 'details'] },
        stat: {
          type: 'Stat',
          props: { label: 'Matches', statePath: 'output.count', hint: 'this week' },
          children: [],
        },
        details: {
          type: 'KeyValue',
          props: { statePath: 'output.meta' },
          children: [],
        },
      },
    }
    const { container } = render({
      spec,
      state: { output: { count: 42, meta: { source: 'arena' } } },
    })
    expect(container.textContent).toContain('Matches')
    expect(container.textContent).toContain('42')
    expect(container.textContent).toContain('this week')
    expect(container.querySelector('dt')?.textContent).toBe('source')
    expect(container.querySelector('dd')?.textContent).toBe('arena')
  })

  it('renders Card description under the title', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['card'] },
        card: {
          type: 'Card',
          props: { title: 'System parameters', description: 'Configure the next run.' },
          children: [],
        },
      },
    }
    const { container } = render({ spec })
    expect(container.querySelector('h2')?.textContent).toBe('System parameters')
    expect(container.textContent).toContain('Configure the next run.')
  })

  it('renders a Stat delta with a tone class', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['up', 'down'] },
        up: {
          type: 'Stat',
          props: { label: 'Reports', value: '12,480', delta: '+14.2%', deltaTone: 'positive' },
          children: [],
        },
        down: {
          type: 'Stat',
          props: { label: 'Errors', value: '3', delta: '-2', deltaTone: 'negative' },
          children: [],
        },
      },
    }
    const { container } = render({ spec })
    expect(container.textContent).toContain('+14.2%')
    const tones = Array.from(container.querySelectorAll('span')).map((node) => node.className)
    expect(tones.some((name) => name.includes('text-[var(--gui-success-text,#23784f)]'))).toBe(true)
    expect(tones.some((name) => name.includes('text-[var(--gui-error-text,#921010)]'))).toBe(true)
  })

  it('renders a Sparkline from comma-separated values', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['chart'] },
        chart: {
          type: 'Sparkline',
          props: { values: '1, 3, 2', label: 'Weekly orders' },
          children: [],
        },
      },
    }
    const { container } = render({ spec })
    expect(container.querySelector('[data-testid="sparkline"]')?.textContent).toContain(
      'Weekly orders'
    )
    expect(container.querySelector('polyline')?.getAttribute('points')).toBeTruthy()
  })

  it('renders a Chart from dummy categories and values', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['chart'] },
        chart: {
          type: 'Chart',
          props: {
            title: 'Spend',
            chartType: 'bar',
            categories: 'Mon, Tue',
            values: '10, 20',
          },
          children: [],
        },
      },
    }
    const { container } = render({ spec })
    expect(container.querySelector('[data-testid="chart"]')).toBeTruthy()
    expect(container.querySelector('[aria-label="Spend"]')).toBeTruthy()
  })

  it('renders Chart empty copy when the bound path has no rows', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['chart'] },
        chart: {
          type: 'Chart',
          props: {
            chartType: 'line',
            statePath: 'daily',
            emptyText: 'No volume yet.',
          },
          children: [],
        },
      },
    }
    const { container } = render({ spec, state: { daily: [] } })
    expect(container.textContent).toContain('No volume yet.')
  })

  it('renders EmptyState with title and body', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['empty'] },
        empty: {
          type: 'EmptyState',
          props: { title: 'No orders yet', body: 'New orders will show up here.', icon: 'inbox' },
          children: [],
        },
      },
    }
    const { container } = render({ spec })
    expect(container.querySelector('[data-testid="empty-state"]')?.textContent).toContain(
      'No orders yet'
    )
    expect(container.textContent).toContain('New orders will show up here.')
  })

  it('renders EmptyState children as the next useful action', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['empty'] },
        empty: {
          type: 'EmptyState',
          props: { title: 'No companies yet', body: 'Search to add the first one.' },
          children: ['go'],
        },
        go: { type: 'Button', props: { label: 'Search companies' }, children: [] },
      },
    }
    const { container } = render({ spec })
    expect(container.querySelector('[data-testid="empty-state"]')?.textContent).toContain(
      'Search companies'
    )
    const action = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Search companies'
    )
    expect(action).toBeTruthy()
  })

  describe('skeletons', () => {
    const skeletonSpec = (type: string, props: Record<string, unknown>): Spec => ({
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['target'] },
        target: { type, props, children: [] },
      },
    })

    function skeletonCount(container: HTMLElement): number {
      return container.querySelectorAll('[data-testid="skeleton"]').length
    }

    it('hides an explicit Skeleton when not pending and shows it while pending', () => {
      const spec = skeletonSpec('Skeleton', { variant: 'card', lines: 3 })

      const idle = render({ spec, pending: false })
      expect(skeletonCount(idle.container)).toBe(0)
      unmount?.()
      unmount = undefined

      const busy = render({ spec, pending: true })
      expect(skeletonCount(busy.container)).toBe(1)
    })

    it('honours the Skeleton lines count', () => {
      const { container } = render({
        spec: skeletonSpec('Skeleton', { variant: 'text', lines: 5 }),
        pending: true,
      })
      const skeleton = container.querySelector('[data-testid="skeleton"]') as HTMLElement
      expect(skeleton.querySelectorAll('.animate-pulse').length).toBe(5)
    })

    it.each([
      ['Table', { statePath: 'articles', columns: 'title' }],
      ['Repeat', { statePath: 'articles' }],
      ['Stat', { label: 'Articles ranked', statePath: 'count' }],
      ['KeyValue', { statePath: 'meta' }],
      ['DataText', { statePath: 'summary' }],
      ['Chart', { chartType: 'line', statePath: 'orderVolume' }],
    ])('auto-skeletons a bound %s while pending with no data', (type, props) => {
      const spec =
        type === 'Repeat'
          ? ({
              root: 'page',
              elements: {
                page: { type: 'Page', props: {}, children: ['target'] },
                target: { type: 'Repeat', props, children: ['card'] },
                card: { type: 'Card', props: { title: '{item.title}' }, children: [] },
              },
            } as Spec)
          : skeletonSpec(type, props)
      const { container } = render({ spec, pending: true, state: {} })
      expect(skeletonCount(container)).toBeGreaterThan(0)
    })

    it.each([
      ['Table', { statePath: 'articles', columns: 'title' }, { articles: [{ title: 'First' }] }],
      ['Stat', { label: 'Articles ranked', statePath: 'count' }, { count: 3 }],
      ['KeyValue', { statePath: 'meta' }, { meta: { source: 'arena' } }],
      ['DataText', { statePath: 'summary' }, { summary: 'All done' }],
    ])('drops the %s skeleton once data arrives', (type, props, state) => {
      const { container } = render({ spec: skeletonSpec(type, props), pending: true, state })
      expect(skeletonCount(container)).toBe(0)
    })

    it('keeps a populated Table visible and busy while it refetches', () => {
      const { container } = render({
        spec: skeletonSpec('Table', { statePath: 'articles', columns: 'title' }),
        pending: true,
        state: { articles: [{ title: 'Kept row' }] },
      })
      expect(skeletonCount(container)).toBe(0)
      expect(container.textContent).toContain('Kept row')
      expect(container.querySelector('[aria-busy="true"]')).toBeTruthy()
    })

    it('leaves an unbound Table alone while pending', () => {
      const { container } = render({
        spec: skeletonSpec('Table', { columns: 'Name', rows: 'Ada' }),
        pending: true,
      })
      expect(skeletonCount(container)).toBe(0)
      expect(container.querySelector('table')).toBeTruthy()
    })

    it('does not auto-skeleton a bound region when nothing is pending', () => {
      const { container } = render({
        spec: skeletonSpec('Table', { statePath: 'articles', columns: 'title' }),
        pending: false,
        state: {},
      })
      expect(skeletonCount(container)).toBe(0)
    })

    it('skeletons only the region the in-flight action writes', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['table', 'stat'] },
          table: {
            type: 'Table',
            props: { statePath: 'articles', columns: 'title' },
            children: [],
          },
          stat: { type: 'Stat', props: { label: 'Count', statePath: 'count' }, children: [] },
        },
      }
      const actionHostKeys = {
        load_list: ['articles'],
        load_stats: ['count'],
      }
      const { container } = render({
        spec,
        pending: true,
        pendingActionIds: new Set(['load_list']),
        actionHostKeys,
        state: {},
      })
      expect(skeletonCount(container)).toBe(1)
      expect(container.textContent).toContain('Count')
    })

    it('does not disable an unrelated action button while another CTA is pending', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['run', 'refresh'] },
          run: { type: 'Button', props: { label: 'Run', actionId: 'run' }, children: [] },
          refresh: {
            type: 'Button',
            props: { label: 'Refresh', actionId: 'refresh' },
            children: [],
          },
        },
      }
      const { container } = render({
        spec,
        pending: true,
        pendingActionIds: new Set(['run']),
        actionHostKeys: { run: ['content'], refresh: ['articles'] },
      })
      const run = Array.from(container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Run')
      )
      const refresh = Array.from(container.querySelectorAll('button')).find((button) =>
        button.textContent?.includes('Refresh')
      )
      expect(run?.disabled).toBe(true)
      expect(refresh?.disabled).toBe(false)
    })

    it('skeletons a pending DataText even when it declares a fallback', () => {
      const spec = skeletonSpec('DataText', {
        statePath: 'summary',
        fallback: 'Run the report to see a summary.',
      })

      const busy = render({ spec, pending: true, state: {} })
      expect(skeletonCount(busy.container)).toBe(1)
      expect(busy.container.textContent).not.toContain('Run the report')
      unmount?.()
      unmount = undefined

      const idle = render({ spec, pending: false, state: {} })
      expect(skeletonCount(idle.container)).toBe(0)
      expect(idle.container.textContent).toContain('Run the report')
    })
  })

  describe('empty states', () => {
    it('shows No results for a bound Table whose array is empty', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['table'] },
          table: {
            type: 'Table',
            props: { statePath: 'articles', columns: 'title' },
            children: [],
          },
        },
      }
      const { container } = render({ spec, pending: false, state: { articles: [] } })
      expect(container.querySelector('table')).toBeNull()
      expect(container.querySelector('[data-testid="empty-state"]')?.textContent).toBe('No results')
    })

    it('shows No details for a bound KeyValue whose object is empty', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['details'] },
          details: { type: 'KeyValue', props: { statePath: 'meta' }, children: [] },
        },
      }
      const { container } = render({ spec, pending: false, state: { meta: {} } })
      expect(container.querySelector('dl')).toBeNull()
      expect(container.querySelector('[data-testid="empty-state"]')?.textContent).toBe('No details')
    })

    it('uses Table emptyText instead of the default collection copy', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['table'] },
          table: {
            type: 'Table',
            props: { statePath: 'articles', columns: 'title', emptyText: 'No matching articles' },
            children: [],
          },
        },
      }
      const { container } = render({ spec, pending: false, state: { articles: [] } })
      expect(container.querySelector('[data-testid="empty-state"]')?.textContent).toBe(
        'No matching articles'
      )
    })

    it('leaves a static Table with no statePath as a table, not an empty state', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['table'] },
          table: {
            type: 'Table',
            props: { columns: 'Name', rows: 'Ada' },
            children: [],
          },
        },
      }
      const { container } = render({ spec, pending: false, state: {} })
      expect(container.querySelector('table')).toBeTruthy()
      expect(container.querySelector('[data-testid="empty-state"]')).toBeNull()
    })
  })

  describe('centring', () => {
    it('centres a search row and its submit button through Stack and Form align', () => {
      const { container } = render({
        spec: {
          root: 'page',
          elements: {
            page: { type: 'Page', props: {}, children: ['form'] },
            form: {
              type: 'Form',
              props: { actionId: 'search', align: 'center' },
              children: ['row'],
            },
            row: {
              type: 'Stack',
              props: { direction: 'horizontal', justify: 'center', align: 'end' },
              children: ['query', 'submit'],
            },
            query: { type: 'TextInput', props: { name: 'query', label: 'Query' }, children: [] },
            submit: { type: 'SubmitButton', props: { label: 'Search' }, children: [] },
          },
        },
      })

      const form = container.querySelector('form') as HTMLElement
      expect(form.className).toContain('items-center')
      const row = form.firstElementChild as HTMLElement
      expect(row.className).toContain('flex-row')
      expect(row.className).toContain('justify-center')
      expect(row.className).toContain('items-end')
    })

    it('leaves a form stretched by default', () => {
      const { container } = render()
      const form = container.querySelector('form') as HTMLElement
      expect(form.className).toContain('items-stretch')
      expect(form.className).not.toContain('items-center')
    })
  })

  describe('Button emphasis', () => {
    function buttonSpec(props: Record<string, unknown>): Spec {
      return {
        root: 'page',
        elements: {
          page: { type: 'Page', props: { title: 'Home' }, children: ['action'] },
          action: { type: 'Button', props, children: [] },
        },
      }
    }

    function renderButton(props: Record<string, unknown>, pending = false) {
      const { container } = render({ spec: buttonSpec(props), pending })
      return container.querySelector('button') as HTMLButtonElement
    }

    it('defaults to the secondary variant so pages are not a wall of primaries', () => {
      const button = renderButton({ label: 'Export', navigateTo: 'report' })
      expect(button.className).toContain('border')
      expect(button.className).not.toContain('bg-[var(--gui-brand,#1a73e8)]')
    })

    it('renders the primary variant as a filled button', () => {
      const button = renderButton({ label: 'Run', actionId: 'run', variant: 'primary' })
      expect(button.className).toContain('bg-[var(--gui-brand,#1a73e8)]')
      expect(button.className).toContain('text-white')
    })

    it('renders the destructive variant as outline danger, not a filled CTA', () => {
      const button = renderButton({ label: 'Delete', actionId: 'del', variant: 'destructive' })
      expect(button.className).toContain('border-[var(--gui-danger,#f31a1a)]')
      expect(button.className).toContain('text-[var(--gui-danger,#f31a1a)]')
      expect(button.className).not.toContain('bg-[var(--gui-danger,#f31a1a)]')
    })

    it('asks the host to confirm a destructive action instead of navigating first', () => {
      const { container, onNavigate, onRunAction } = render({
        spec: buttonSpec({
          label: 'Delete',
          actionId: 'del',
          navigateTo: 'home',
          variant: 'destructive',
        }),
      })
      const button = container.querySelector('button') as HTMLButtonElement
      act(() => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onNavigate).not.toHaveBeenCalled()
      expect(onRunAction).toHaveBeenCalledWith('del', expect.any(Object), { destructive: true })
    })

    it('asks the host to confirm when uxPlan.confirm is true even without a destructive variant', () => {
      const { container, onNavigate, onRunAction } = render({
        spec: buttonSpec({ label: 'Save', actionId: 'save', variant: 'secondary' }),
        uxPlan: {
          actions: { save: { kind: 'mutation', confirm: true, retry: true } },
          fallbackLoading: {},
        },
      })
      const button = container.querySelector('button') as HTMLButtonElement
      act(() => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onNavigate).not.toHaveBeenCalled()
      expect(onRunAction).toHaveBeenCalledWith('save', expect.any(Object), { destructive: true })
    })

    it('does not confirm a destructive-looking button when uxPlan.confirm is false', () => {
      const { container, onNavigate, onRunAction } = render({
        spec: buttonSpec({
          label: 'Delete',
          actionId: 'del',
          navigateTo: 'home',
          variant: 'destructive',
        }),
        uxPlan: {
          actions: { del: { kind: 'mutation', confirm: false, retry: true } },
          fallbackLoading: {},
        },
      })
      const button = container.querySelector('button') as HTMLButtonElement
      act(() => {
        button.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onNavigate).toHaveBeenCalledWith('home')
      expect(onRunAction).toHaveBeenCalledWith('del', expect.any(Object))
      expect(onRunAction.mock.calls[0]?.[2]).toBeUndefined()
    })

    it('does not disable an action omitted from uxPlan while pending', () => {
      const { container } = render({
        spec: buttonSpec({ label: 'Run', actionId: 'run' }),
        pending: true,
        uxPlan: { actions: {}, fallbackLoading: {} },
      })
      expect((container.querySelector('button') as HTMLButtonElement).disabled).toBe(false)
    })

    it('renders the ghost variant without a border or fill', () => {
      const button = renderButton({ label: 'Back', navigateTo: 'home', variant: 'ghost' })
      expect(button.className).not.toContain('border-[var(--gui-border')
      expect(button.className).not.toContain('bg-[var(--gui-danger,#f31a1a)]')
      expect(button.className).not.toContain('bg-[var(--gui-brand,#1a73e8)]')
    })

    it('renders the outline pill variant with a brand border', () => {
      const button = renderButton({
        label: 'View analysis history',
        navigateTo: 'results',
        variant: 'outline',
        shape: 'pill',
      })
      expect(button.className).toContain('border-[var(--gui-brand,#1a73e8)]')
      expect(button.className).toContain('rounded-full')
      expect(button.className).not.toContain('bg-[var(--gui-brand,#1a73e8)]')
    })

    it('applies the small size', () => {
      const button = renderButton({ label: 'Filter', actionId: 'filter', size: 'sm' })
      expect(button.className).toContain('h-8')
    })

    it('never leaks a size token into the inline font size', () => {
      const button = renderButton({ label: 'Filter', actionId: 'filter', size: 'sm' })
      expect(button.style.fontSize).toBe('')
    })

    it('keeps a navigation-only button clickable while another action is pending', () => {
      const button = renderButton({ label: 'Back', navigateTo: 'home' }, true)
      expect(button.disabled).toBe(false)
    })

    it('disables an action button while an action is pending', () => {
      const button = renderButton({ label: 'Run', actionId: 'run' }, true)
      expect(button.disabled).toBe(true)
    })

    it('hides a Load more button when hasMore is false', () => {
      const { container } = render({
        spec: buttonSpec({ label: 'Load more', actionId: 'load_list', showWhen: 'hasMore' }),
        state: { hasMore: false },
      })
      expect(container.querySelector('button')).toBeNull()
    })

    it('shows a Load more button when hasMore is true', () => {
      const { container } = render({
        spec: buttonSpec({ label: 'Load more', actionId: 'load_list', showWhen: 'hasMore' }),
        state: { hasMore: true, nextCursor: 'page-2' },
      })
      expect(container.querySelector('button')?.textContent).toBe('Load more')
    })

    it('sends nextCursor from host state on a Load more click', () => {
      const { container, onRunAction } = render({
        spec: buttonSpec({ label: 'Load more', actionId: 'load_list' }),
        state: { nextCursor: 'page-2', articles: [{ id: '1' }] },
      })
      act(() => {
        container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onRunAction).toHaveBeenCalledWith(
        'load_list',
        expect.objectContaining({ nextCursor: 'page-2' })
      )
      expect(onRunAction.mock.calls[0]?.[1]).not.toHaveProperty('articles')
    })
  })

  it('ticks earlier ProgressSteps after elapsed time while pending', () => {
    vi.useFakeTimers()
    try {
      const { container } = render({ spec: progressSpec, pending: true })
      expect(container.textContent).toContain('Connecting')
      expect(container.textContent).toContain('Researching')
      const before = Array.from(container.querySelectorAll('li')).map((item) => item.textContent)
      expect(before[0]).not.toContain('✓')

      act(() => {
        vi.advanceTimersByTime(500)
      })

      const after = Array.from(container.querySelectorAll('li')).map((item) => item.textContent)
      expect(after[0]).toContain('✓')
      expect(after[1]).not.toContain('✓')
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows DataText content from an aliased string field', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['section'] },
        section: {
          type: 'Stack',
          props: { showWhen: 'artical_data' },
          children: ['body'],
        },
        body: {
          type: 'DataText',
          props: { statePath: 'content', fallback: '' },
          children: [],
        },
      },
    }
    const { container } = render({
      spec,
      state: { content: '# Root Canal Treatment' },
      proseAliasKeys: ['content', 'artical_data'],
    })
    expect(container.textContent).toContain('Root Canal Treatment')
  })

  it('hides WorkingCard when a different action is pending', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: { title: 'Results' }, children: ['working'] },
        working: {
          type: 'WorkingCard',
          props: {
            title: 'Working on it…',
            steps: 'Connecting…\nDrafting…',
            actionId: 'generate',
            cancelTo: 'home',
          },
          children: [],
        },
      },
    }
    const { container } = render({
      spec,
      pending: true,
      pendingActionIds: new Set(['fetch_history']),
    })
    expect(container.querySelector('[data-testid="working-card"]')).toBeNull()
  })

  it('hides WorkingCard when idle', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: { title: 'Results' }, children: ['working'] },
        working: {
          type: 'WorkingCard',
          props: {
            title: 'Working on it…',
            steps: 'Connecting…\nDrafting…',
            cancelTo: 'home',
          },
          children: [],
        },
      },
    }
    const { container } = render({ spec, pending: false })
    expect(container.querySelector('[data-testid="working-card"]')).toBeNull()
  })

  it('ticks WorkingCard steps and bar in lockstep, interpolates copy, and Cancel returns to idle', () => {
    vi.useFakeTimers()
    try {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: { title: 'Results' }, children: ['working'] },
          working: {
            type: 'WorkingCard',
            props: {
              title: "Working on '{targetKeyword}' for {clientBrand}...",
              steps:
                "Connecting to the recommendation agent…\nResearching the client's market & competitors…\nAnalyzing keyword demand & search intent…\nScoring topic opportunities…\nDrafting article recommendations…",
              estimate: 'Usually takes 90–150s',
              intervalMs: 2000,
              tip: "Tip: Articles targeting '{targetKeyword}' perform best when every H2 maps to one distinct search intent.",
              cancelTo: 'home',
              skeleton: true,
            },
            children: [],
          },
        },
      }
      const { container, onNavigate, onCancelPending } = render({
        spec,
        pending: true,
        state: { inputs: { targetKeyword: 'CFL Bulbs', clientBrand: 'Philips' } },
      })
      expect(container.textContent).toContain("Working on 'CFL Bulbs' for Philips...")
      expect(container.textContent).toContain('Usually takes 90–150s')
      expect(container.textContent).toContain("Articles targeting 'CFL Bulbs'")
      expect(container.querySelector('[data-testid="skeleton"]')).toBeTruthy()
      const bar = container.querySelector('[data-testid="working-card-bar"]')
      expect(bar?.getAttribute('aria-valuenow')).toBe('20')
      const first = container.querySelectorAll('li')[0]
      expect(first?.className).not.toContain('line-through')

      act(() => {
        vi.advanceTimersByTime(2000)
      })

      expect(
        container.querySelector('[data-testid="working-card-bar"]')?.getAttribute('aria-valuenow')
      ).toBe('40')
      expect(container.querySelectorAll('li')[0]?.className).toContain('line-through')

      act(() => {
        container
          .querySelector('[data-testid="working-card-cancel"]')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onCancelPending).toHaveBeenCalled()
      expect(onNavigate).toHaveBeenCalledWith('home')
    } finally {
      vi.useRealTimers()
    }
  })

  it('skips the Page sr-only h1 when a PageHeader already provides one', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: { title: 'Home' }, children: ['header'] },
        header: {
          type: 'PageHeader',
          props: { title: 'Recommendations', subtitle: 'Ranked for you' },
          children: [],
        },
      },
    }
    const { container } = render({ spec })
    const headings = Array.from(container.querySelectorAll('h1'))
    expect(headings.map((heading) => heading.textContent)).toEqual(['Recommendations'])
    expect(container.querySelector('h1.sr-only')).toBeNull()
  })

  it('associates a Switch with its visible label', () => {
    const { container } = render({
      spec: {
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['form'] },
          form: { type: 'Form', props: { actionId: 'save' }, children: ['notify'] },
          notify: {
            type: 'Switch',
            props: { name: 'notify', label: 'Notify', defaultChecked: false },
            children: [],
          },
        },
      },
    })
    const toggle = container.querySelector('button[role="switch"]')
    const label = container.querySelector('label[for="field-notify"]')
    expect(toggle?.id).toBe('field-notify')
    expect(label?.textContent).toBe('Notify')
    expect(toggle?.getAttribute('aria-labelledby')).toBe('field-notify-label')
  })

  it('marks streamed DataText as a live region', () => {
    const { container } = render({ spec: replySpec, state: {} })
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull()
  })

  /**
   * A SubmitButton outside a Form has nothing to submit. Before this it rendered a
   * bare type="submit" with no handler, so the primary action of an already-published
   * app silently did nothing.
   */
  describe('SubmitButton outside a Form', () => {
    function formlessSpec(props: Record<string, unknown>): Spec {
      return {
        root: 'page',
        elements: {
          page: { type: 'Page', props: { title: 'Search' }, children: ['stack'] },
          stack: { type: 'Stack', props: { direction: 'horizontal' }, children: ['submit'] },
          submit: { type: 'SubmitButton', props, children: [] },
        },
      }
    }

    it('runs its own actionId on click', () => {
      const { container, onRunAction } = render({
        spec: formlessSpec({ label: 'Search', actionId: 'run_search' }),
      })
      const button = container.querySelector('button')

      expect(button?.getAttribute('type')).toBe('button')
      expect(button?.className).not.toContain('w-full')
      act(() => {
        button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(onRunAction).toHaveBeenCalledWith('run_search', expect.any(Object))
    })

    it('still submits normally when it is inside a Form', () => {
      const { container, onRunAction } = render()
      const button = container.querySelector('button[type="submit"]')
      expect(button).not.toBeNull()

      act(() => {
        container
          .querySelector('form')
          ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      })
      expect(onRunAction).toHaveBeenCalledWith('submit_lead', expect.any(Object))
    })

    it('is inside a Form even when nested below other elements', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: { title: 'Deep' }, children: ['form'] },
          form: { type: 'Form', props: { actionId: 'save' }, children: ['card'] },
          card: { type: 'Card', props: { title: 'Details' }, children: ['submit'] },
          submit: { type: 'SubmitButton', props: { label: 'Save' }, children: [] },
        },
      }
      const { container } = render({ spec })

      expect(container.querySelector('button[type="submit"]')).not.toBeNull()
      expect(container.querySelector('button[type="button"]')).toBeNull()
    })

    it('sends the Repeat row values when it sits inside a Repeat', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: { title: 'Rows' }, children: ['grid'] },
          grid: { type: 'Grid', props: { columns: '2' }, children: ['repeat'] },
          repeat: { type: 'Repeat', props: { statePath: 'rows' }, children: ['submit'] },
          submit: {
            type: 'SubmitButton',
            props: { label: 'Pick', actionId: 'pick_row' },
            children: [],
          },
        },
      }
      const { container, onRunAction } = render({ spec, state: { rows: [{ id: 'r1' }] } })

      act(() => {
        container.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })

      expect(onRunAction).toHaveBeenCalledWith('pick_row', expect.objectContaining({ id: 'r1' }))
    })
  })

  it('centers a PageHeader with kicker and display title', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['header'] },
        header: {
          type: 'PageHeader',
          props: {
            title: 'Find any company',
            subtitle: 'Search a name or domain.',
            kicker: 'Watchtower',
            align: 'center',
          },
          children: ['history'],
        },
        history: {
          type: 'Button',
          props: { label: 'View analysis history', variant: 'outline', shape: 'pill' },
          children: [],
        },
      },
    }
    const { container } = render({ spec })
    expect(container.textContent).toContain('Watchtower')
    expect(container.querySelector('h1')?.className).toContain('gui-display-size')
    const copy = container.querySelector('h1')?.parentElement
    expect(copy?.className).toContain('text-center')
    expect(container.textContent).toContain('View analysis history')
  })

  it('renders SearchField with a nested submit and suggestion chips that fill the input', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['search'] },
        search: {
          type: 'SearchField',
          props: {
            name: 'query',
            placeholder: 'Search a company',
            actionId: 'search_companies',
            suggestions: 'Stripe, Notion',
            submitLabel: 'Search',
          },
          children: [],
        },
      },
    }
    const { container, onRunAction } = render({ spec })
    const field = container.querySelector('[data-testid="search-field"]') as HTMLElement
    expect(field).toBeTruthy()
    expect(field.querySelector('button')?.textContent).toBe('Search')
    const input = container.querySelector('input[name="query"]') as HTMLInputElement
    const suggestion = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Stripe'
    )
    act(() => {
      suggestion?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(input.value).toBe('Stripe')
    act(() => {
      container
        .querySelector('form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(onRunAction).toHaveBeenCalledWith(
      'search_companies',
      expect.objectContaining({ query: 'Stripe' })
    )
  })

  it('fills a SearchField when a Chip setValue is clicked', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['search', 'chip'] },
        search: {
          type: 'SearchField',
          props: { name: 'query', placeholder: 'Search', actionId: 'search_companies' },
          children: [],
        },
        chip: {
          type: 'Chip',
          props: { text: 'Try Stripe', tone: 'muted', setValue: 'query=Stripe' },
          children: [],
        },
      },
    }
    const { container } = render({ spec })
    const input = container.querySelector('input[name="query"]') as HTMLInputElement
    const chip = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Try Stripe'
    )
    act(() => {
      chip?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(input.value).toBe('Stripe')
  })

  it('renders Card subtitle, media, and footer', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['card'] },
        card: {
          type: 'Card',
          props: {
            title: 'Stripe',
            subtitle: 'stripe.com',
            description: 'Payments infrastructure.',
            footerText: 'Enterprise · 2010',
          },
          children: ['logo', 'analyze'],
        },
        logo: { type: 'Avatar', props: { initials: 'ST' }, children: [] },
        analyze: {
          type: 'Button',
          props: { label: 'Analyze', variant: 'secondary' },
          children: [],
        },
      },
    }
    const { container } = render({ spec })
    expect(container.querySelector('h2')?.textContent).toBe('Stripe')
    expect(container.textContent).toContain('stripe.com')
    expect(container.querySelector('[data-testid="avatar"]')?.textContent).toBe('ST')
    const footer = container.querySelector('[data-testid="card-footer"]')
    expect(footer?.textContent).toContain('Enterprise · 2010')
    expect(footer?.textContent).toContain('Analyze')
  })

  it('renders Card variant muted without a shadow and resolves padding tokens', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['card'] },
        card: {
          type: 'Card',
          props: { title: 'Quiet', variant: 'muted', padding: 'lg' },
          children: [],
        },
      },
    }
    const { container } = render({ spec })
    const card = container.querySelector('[data-testid="card"]') as HTMLElement
    expect(card.getAttribute('data-variant')).toBe('muted')
    expect(card.className).toContain('border-[var(--gui-border,#e2e3e5)]')
    expect(card.className).not.toContain('shadow-[var(--gui-shadow-card')
    expect(card.style.padding).toBe('var(--gui-space-lg, 24px)')
  })

  it('resolves Stack gap tokens to density-aware CSS variables', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['stack'] },
        stack: { type: 'Stack', props: { gap: 'lg' }, children: [] },
      },
    }
    const { container } = render({ spec })
    const stack = container.querySelector('div.flex') as HTMLElement
    expect(stack.style.gap).toBe('var(--gui-space-lg, 24px)')
  })

  it('resolves host binding tokens on Text and Chip', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['heading', 'chip'] },
        heading: {
          type: 'Heading',
          props: { text: 'Keyword: {Target Keyword}', level: 'h2' },
          children: [],
        },
        chip: {
          type: 'Chip',
          props: { text: 'Client: {clientBrand}', tone: 'muted' },
          children: [],
        },
      },
    }
    const { container } = render({
      spec,
      state: { inputs: { targetKeyword: 'Dental implants', clientBrand: '42 North Dental' } },
    })
    expect(container.textContent).toContain('Keyword: Dental implants')
    expect(container.textContent).toContain('Client: 42 North Dental')
    expect(container.textContent).not.toContain('{Target Keyword}')
  })

  it('hides an idle ProgressBar that has no real percent', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['bar'] },
        bar: { type: 'ProgressBar', props: { value: null }, children: [] },
      },
    }
    const { container } = render({ spec, pending: false })
    expect(container.querySelector('[data-testid="progress-bar"]')).toBeNull()
  })

  it('shows a ProgressBar while pending even without a percent', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['bar'] },
        bar: { type: 'ProgressBar', props: { value: null }, children: [] },
      },
    }
    const { container } = render({ spec, pending: true })
    expect(container.querySelector('[data-testid="progress-bar"]')).toBeTruthy()
  })

  it('renders ProgressBar percent and EntityHeader identity', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['entity', 'bar'] },
        entity: {
          type: 'EntityHeader',
          props: {
            title: 'Stripe',
            description: 'Resolving company profile.',
            badge: 'Running',
            initials: 'ST',
            meta: 'Payments, San Francisco',
          },
          children: [],
        },
        bar: { type: 'ProgressBar', props: { value: 40 }, children: [] },
      },
    }
    const { container } = render({ spec })
    expect(container.querySelector('[data-testid="entity-header"]')?.textContent).toContain(
      'Stripe'
    )
    expect(container.textContent).toContain('Running')
    expect(container.textContent).toContain('Payments')
    const bar = container.querySelector('[data-testid="progress-bar"]')
    expect(bar?.getAttribute('aria-valuenow')).toBe('40')
  })

  it('indents nested ProgressSteps lines while pending', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['progress'] },
        progress: {
          type: 'ProgressSteps',
          props: { steps: 'Resolving company profile\n  Registry lookup', durationMs: 1000 },
          children: [],
        },
      },
    }
    const { container } = render({ spec, pending: true })
    expect(container.textContent).toContain('Resolving company profile')
    expect(container.textContent).toContain('Registry lookup')
    const nested = Array.from(container.querySelectorAll('li')).find((item) =>
      item.textContent?.includes('Registry lookup')
    )
    expect(nested?.className).toContain('pl-6')
  })

  it('marks a required field label without changing validation copy', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['form'] },
        form: { type: 'Form', props: { actionId: 'save' }, children: ['name'] },
        name: {
          type: 'TextInput',
          props: { name: 'name', label: 'Name', required: true },
          children: [],
        },
      },
    }
    const { container } = render({ spec })
    expect(container.querySelector('label')?.textContent).toBe('Name *')
  })

  it('shows busy chrome on a pending action button but not on a nav-only button', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['run', 'back'] },
        run: { type: 'Button', props: { label: 'Run', actionId: 'run' }, children: [] },
        back: { type: 'Button', props: { label: 'Back', navigateTo: 'home' }, children: [] },
      },
    }
    const { container } = render({ spec, pending: true })
    const run = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Run')
    )
    const back = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Back'
    )
    expect(run?.disabled).toBe(true)
    expect(run?.querySelector('[data-testid="action-busy"]')).toBeTruthy()
    expect(back?.disabled).toBe(false)
    expect(back?.querySelector('[data-testid="action-busy"]')).toBeNull()
  })

  it('shows busy chrome on a pending SubmitButton', () => {
    const { container } = render({ pending: true })
    const submit = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Submit')
    )
    expect(submit?.disabled).toBe(true)
    expect(submit?.getAttribute('aria-busy')).toBe('true')
    expect(submit?.querySelector('[data-testid="action-busy"]')).toBeTruthy()
  })

  it('stretches a form SubmitButton full width and tints inputs on focus', () => {
    const { container } = render()
    const submit = container.querySelector('button[type="submit"]')
    expect(submit?.className).toContain('w-full')
    const form = container.querySelector('form')
    expect(form?.className).toContain('max-w-[var(--gui-measure')
    const input = container.querySelector('input[name="name"]')
    expect(input?.className).toContain('focus-visible:bg-[var(--gui-brand-surface,#f3f8fe)]')
  })

  it('shows busy chrome on a pending SearchField submit', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['search'] },
        search: {
          type: 'SearchField',
          props: { name: 'query', actionId: 'search', submitLabel: 'Search' },
          children: [],
        },
      },
    }
    const { container } = render({ spec, pending: true })
    const submit = container.querySelector('[data-testid="search-field"] button')
    expect(submit?.getAttribute('disabled')).not.toBeNull()
    expect(submit?.querySelector('[data-testid="action-busy"]')).toBeTruthy()
  })

  it('shows busy chrome on a pending Chip with actionId', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['run', 'hint'] },
        run: {
          type: 'Chip',
          props: { text: 'Analyze', actionId: 'analyze' },
          children: [],
        },
        hint: { type: 'Chip', props: { text: 'Hint', setValue: 'query=x' }, children: [] },
      },
    }
    const { container } = render({ spec, pending: true })
    const run = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Analyze')
    )
    const hint = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Hint')
    )
    expect(run?.disabled).toBe(true)
    expect(run?.getAttribute('aria-busy')).toBe('true')
    expect(run?.querySelector('[data-testid="action-busy"]')).toBeTruthy()
    expect(hint?.disabled).toBe(false)
    expect(hint?.querySelector('[data-testid="action-busy"]')).toBeNull()
  })

  it('leaves a form TextInput enabled while the submit control is pending', () => {
    const { container } = render({ pending: true })
    const input = container.querySelector('input[name="name"]') as HTMLInputElement
    expect(input.disabled).toBe(false)
    const submit = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Submit')
    )
    expect(submit?.disabled).toBe(true)
  })

  it('uses the current path for Tabs when it matches an item, otherwise activePath', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['tabs'] },
        tabs: {
          type: 'Tabs',
          props: { items: 'Home|home\nReports|reports', activePath: 'home' },
          children: [],
        },
      },
    }
    const matched = render({ spec, currentPath: 'reports' })
    const matchedTabs = Array.from(matched.container.querySelectorAll('[role="tab"]'))
    expect(matchedTabs[1]?.getAttribute('aria-current')).toBe('page')
    expect(matchedTabs[0]?.getAttribute('aria-current')).toBeNull()
    unmount?.()
    const unmatched = render({ spec, currentPath: 'detail' })
    const unmatchedTabs = Array.from(unmatched.container.querySelectorAll('[role="tab"]'))
    expect(unmatchedTabs[0]?.getAttribute('aria-current')).toBe('page')
  })

  it('moves Tab focus with arrow keys without navigating', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['tabs'] },
        tabs: {
          type: 'Tabs',
          props: { items: 'Home|home\nReports|reports', activePath: 'home' },
          children: [],
        },
      },
    }
    const { container, onNavigate } = render({ spec })
    const tabs = Array.from(container.querySelectorAll('[role="tab"]')) as HTMLButtonElement[]
    act(() => {
      tabs[0]?.focus()
      tabs[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(document.activeElement).toBe(tabs[1])
    expect(onNavigate).not.toHaveBeenCalled()
  })

  it('lazy-loads images and shows a fallback when src is empty', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['photo'] },
        photo: {
          type: 'Image',
          props: { src: '', alt: 'Company logo', width: null, height: null },
          children: [],
        },
      },
    }
    const { container } = render({ spec })
    expect(container.querySelector('[data-testid="image-fallback"]')?.textContent).toBe(
      'Company logo'
    )
    expect(container.querySelector('img')).toBeNull()
  })

  it('sets loading=lazy on a content image', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['photo'] },
        photo: {
          type: 'Image',
          props: { src: 'https://example.com/logo.png', alt: 'Logo', width: null, height: null },
          children: [],
        },
      },
    }
    const { container } = render({ spec })
    expect(container.querySelector('img')?.getAttribute('loading')).toBe('lazy')
  })

  it('falls back when an image fails to load', () => {
    const spec: Spec = {
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['photo'] },
        photo: {
          type: 'Image',
          props: { src: 'https://example.com/broken.png', alt: 'Logo' },
          children: [],
        },
      },
    }
    const { container } = render({ spec })
    act(() => {
      container.querySelector('img')?.dispatchEvent(new Event('error'))
    })
    expect(container.querySelector('[data-testid="image-fallback"]')?.textContent).toBe('Logo')
    expect(container.querySelector('img')).toBeNull()
  })

  describe('catalog Filter, Drawer, Modal, Toast', () => {
    it('renders Filter children in a toolbar', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: { title: 'Home' }, children: ['filters'] },
          filters: {
            type: 'Filter',
            props: {},
            children: ['status'],
          },
          status: { type: 'Chip', props: { text: 'Active' }, children: [] },
        },
      }
      const { container } = render({ spec })
      const filter = container.querySelector('[data-testid="filter"]')
      expect(filter).toBeTruthy()
      expect(filter?.textContent).toContain('Active')
    })

    it('hides Drawer until showWhen matches', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: { title: 'Home' }, children: ['list', 'drawer'] },
          list: { type: 'Text', props: { text: 'Company list' }, children: [] },
          drawer: {
            type: 'Drawer',
            props: { title: 'Detail', showWhen: 'selectedId' },
            children: ['body'],
          },
          body: { type: 'Text', props: { text: 'Row detail' }, children: [] },
        },
      }
      const { container } = render({ spec, state: {} })
      expect(container.querySelector('[data-testid="drawer"]')).toBeNull()
      expect(container.textContent).toContain('Company list')
    })

    it('shows Drawer when showWhen matches, keeps the list visible, and close clears the item', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: { title: 'Home' }, children: ['list', 'drawer'] },
          list: { type: 'Text', props: { text: 'Company list' }, children: [] },
          drawer: {
            type: 'Drawer',
            props: { title: 'Detail', showWhen: 'selectedId' },
            children: ['body'],
          },
          body: { type: 'Text', props: { text: 'Row detail' }, children: [] },
        },
      }
      const { container, onClearItem } = render({ spec, state: { selectedId: 'co_1' } })
      const drawer = container.querySelector('[data-testid="drawer"]')
      expect(drawer).toBeTruthy()
      expect(container.textContent).toContain('Company list')
      expect(drawer?.textContent).toContain('Row detail')
      act(() => {
        container
          .querySelector('[data-testid="drawer-close"]')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onClearItem).toHaveBeenCalled()
      expect(container.querySelector('[data-testid="drawer"]')).toBeNull()
    })

    it('hides Modal until showWhen matches', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: { title: 'Home' }, children: ['modal'] },
          modal: {
            type: 'Modal',
            props: { title: 'Rename', showWhen: 'selectedId' },
            children: ['copy'],
          },
          copy: { type: 'Text', props: { text: 'Rename this record' }, children: [] },
        },
      }
      const { container } = render({ spec, state: {} })
      expect(container.querySelector('[data-testid="modal"]')).toBeNull()
    })

    it('shows Modal when showWhen matches and close clears the item', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: { title: 'Home' }, children: ['modal'] },
          modal: {
            type: 'Modal',
            props: { title: 'Rename', showWhen: 'selectedId' },
            children: ['copy'],
          },
          copy: { type: 'Text', props: { text: 'Rename this record' }, children: [] },
        },
      }
      const { container, onClearItem } = render({ spec, state: { selectedId: 'rec_1' } })
      const modal = container.querySelector('[data-testid="modal"]')
      expect(modal).toBeTruthy()
      expect(modal?.textContent).toContain('Rename this record')
      act(() => {
        container
          .querySelector('[data-testid="modal-close"]')
          ?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(onClearItem).toHaveBeenCalled()
      expect(container.querySelector('[data-testid="modal"]')).toBeNull()
    })

    it('opens a create Modal from a Button setValue CTA', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: { title: 'Tasks' }, children: ['new_task', 'modal'] },
          new_task: {
            type: 'Button',
            props: { label: 'New Task', setValue: 'creating=true', variant: 'primary' },
            children: [],
          },
          modal: {
            type: 'Modal',
            props: { title: 'New Task', showWhen: 'creating' },
            children: ['copy'],
          },
          copy: { type: 'Text', props: { text: 'Task title' }, children: [] },
        },
      }
      const { container, onRunAction, onNavigate } = render({ spec, state: {} })
      expect(container.querySelector('[data-testid="modal"]')).toBeNull()
      const cta = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'New Task'
      )
      act(() => {
        cta?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(container.querySelector('[data-testid="modal"]')?.textContent).toContain('Task title')
      expect(onRunAction).not.toHaveBeenCalled()
      expect(onNavigate).not.toHaveBeenCalled()
    })

    it('opens a closed create Modal instead of running its actionId', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: { title: 'Projects' }, children: ['new_project', 'modal'] },
          new_project: {
            type: 'Button',
            props: { label: 'New Project', actionId: 'create_project', variant: 'primary' },
            children: [],
          },
          modal: {
            type: 'Modal',
            props: { title: 'New Project', showWhen: 'creating' },
            children: ['form'],
          },
          form: {
            type: 'Form',
            props: { actionId: 'create_project' },
            children: ['name', 'submit'],
          },
          name: {
            type: 'TextInput',
            props: { name: 'name', label: 'Name', required: true },
            children: [],
          },
          submit: { type: 'SubmitButton', props: { label: 'Create' }, children: [] },
        },
      }
      const { container, onRunAction } = render({ spec, state: {} })
      const cta = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'New Project'
      )
      act(() => {
        cta?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
      expect(container.querySelector('[data-testid="modal"]')).toBeTruthy()
      expect(onRunAction).not.toHaveBeenCalled()
    })

    it('hides Toast until showWhen is true', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: { title: 'Home' }, children: ['toast'] },
          toast: {
            type: 'Toast',
            props: { text: 'Link copied', tone: 'success', showWhen: 'selectedId' },
            children: [],
          },
        },
      }
      const { container } = render({ spec, state: {} })
      expect(container.querySelector('[data-testid="catalog-toast"]')).toBeNull()
    })

    it('shows Toast when showWhen is true without using the host save toast', () => {
      const spec: Spec = {
        root: 'page',
        elements: {
          page: { type: 'Page', props: { title: 'Home' }, children: ['toast'] },
          toast: {
            type: 'Toast',
            props: { text: 'Link copied', tone: 'success', showWhen: 'selectedId' },
            children: [],
          },
        },
      }
      const { container } = render({ spec, state: { selectedId: 'row_1' } })
      expect(container.querySelector('[data-testid="catalog-toast"]')?.textContent).toBe(
        'Link copied'
      )
      expect(container.querySelector('[data-testid="action-success-toast"]')).toBeNull()
    })
  })
})

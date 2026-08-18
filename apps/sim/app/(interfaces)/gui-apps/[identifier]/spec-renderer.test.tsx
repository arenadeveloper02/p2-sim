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
    onNavigate?: ReturnType<typeof vi.fn>
    onRunAction?: ReturnType<typeof vi.fn>
  }) {
    const onNavigate = options?.onNavigate ?? vi.fn()
    const onRunAction = options?.onRunAction ?? vi.fn().mockResolvedValue(undefined)
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
          onNavigate={onNavigate}
          onRunAction={onRunAction}
        />
      )
    })
    unmount = () => {
      act(() => {
        root.unmount()
      })
      container.remove()
    }
    return { container, onNavigate, onRunAction }
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

  it('renders a DataText JSON companies array as a table, not a wrapping paragraph', () => {
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
    expect(container.querySelector('table')).toBeTruthy()
    expect(container.textContent).toContain('Software Development')
    expect(container.textContent).toContain('1441')
    expect(container.textContent).not.toContain('finishReason')
    expect(container.querySelector('p')?.textContent ?? '').not.toContain('tokens')
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

    it('renders one Card per array item as a direct Grid child', () => {
      const { container } = render({ spec: repeatSpec, state: { articles } })
      const grid = container.querySelector('.grid') as HTMLElement
      const cards = Array.from(grid.children)
      expect(cards).toHaveLength(2)
      expect(cards[0]?.querySelector('h2')?.textContent).toBe('First')
      expect(cards[1]?.querySelector('h2')?.textContent).toBe('Second')
      expect(container.textContent).toContain('9')
      expect(container.textContent).toContain('4')
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

    it('caps a large array so the page cannot mount thousands of Cards', () => {
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
      expect(container.querySelectorAll('h2')).toHaveLength(48)
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
    const { container, onNavigate } = render({ spec })
    const buttons = Array.from(container.querySelectorAll('nav button'))
    expect(buttons.map((button) => button.textContent)).toEqual(['Home', 'Reports'])
    expect(buttons[0]?.className).toContain('font-medium')
    act(() => {
      buttons[1]?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
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
    expect(tones.some((name) => name.includes('text-emerald-700'))).toBe(true)
    expect(tones.some((name) => name.includes('text-red-700'))).toBe(true)
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
      expect(button.className).not.toContain('bg-[var(--color-ds-blue-600,#2563eb)]')
    })

    it('renders the primary variant as a filled button', () => {
      const button = renderButton({ label: 'Run', actionId: 'run', variant: 'primary' })
      expect(button.className).toContain('bg-[var(--color-ds-blue-600,#2563eb)]')
      expect(button.className).toContain('text-white')
    })

    it('renders the destructive variant in red', () => {
      const button = renderButton({ label: 'Delete', actionId: 'del', variant: 'destructive' })
      expect(button.className).toContain('bg-red-600')
    })

    it('renders the ghost variant without a border or fill', () => {
      const button = renderButton({ label: 'Back', navigateTo: 'home', variant: 'ghost' })
      expect(button.className).not.toContain('border')
      expect(button.className).not.toContain('bg-red-600')
    })

    it('applies the small size', () => {
      const button = renderButton({ label: 'Filter', actionId: 'filter', size: 'sm' })
      expect(button.className).toContain('text-xs')
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
})

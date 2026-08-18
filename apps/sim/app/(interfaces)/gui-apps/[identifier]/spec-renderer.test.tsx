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
      ['Stat', { label: 'Articles ranked', statePath: 'count' }],
      ['KeyValue', { statePath: 'meta' }],
      ['DataText', { statePath: 'summary' }],
    ])('auto-skeletons a bound %s while pending with no data', (type, props) => {
      const { container } = render({ spec: skeletonSpec(type, props), pending: true, state: {} })
      expect(skeletonCount(container)).toBe(1)
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

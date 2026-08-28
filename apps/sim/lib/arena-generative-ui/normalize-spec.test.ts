/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import { arenaGenerativeUiCatalog } from '@/lib/arena-generative-ui/catalog'
import { normalizeGeneratedSpec } from '@/lib/arena-generative-ui/normalize-spec'
import { twoPageHomeSpec } from '@/lib/arena-generative-ui/two-page-app.fixture'

interface NormalizedElement {
  type: string
  props: Record<string, unknown>
  children: string[]
}

function elements(spec: unknown): Record<string, NormalizedElement> {
  return (spec as { elements: Record<string, NormalizedElement> }).elements
}

function findByType(spec: unknown, type: string): NormalizedElement | undefined {
  return Object.values(elements(spec)).find((element) => element.type === type)
}

describe('normalizeGeneratedSpec', () => {
  it('returns null for non-object input', () => {
    expect(normalizeGeneratedSpec(null)).toBeNull()
    expect(normalizeGeneratedSpec('spec')).toBeNull()
    expect(normalizeGeneratedSpec([])).toBeNull()
  })

  it('returns null when there are no elements and no root node type', () => {
    expect(normalizeGeneratedSpec({ elements: {} })).toBeNull()
    expect(normalizeGeneratedSpec({ root: 'page' })).toBeNull()
  })

  it('leaves an already valid flat spec unchanged', () => {
    expect(normalizeGeneratedSpec(twoPageHomeSpec)).toEqual(twoPageHomeSpec)
  })

  it('fills in a missing children array', () => {
    const spec = normalizeGeneratedSpec({
      root: 'page',
      elements: { page: { type: 'Page', props: {} } },
    })
    expect(elements(spec).page.children).toEqual([])
  })

  it('flattens a nested children tree into an elements map with string ids', () => {
    const spec = normalizeGeneratedSpec({
      type: 'Page',
      props: { title: 'Home' },
      children: [
        {
          type: 'Section',
          props: { width: 'wide' },
          children: [{ type: 'Heading', props: { text: 'Hello', level: 'h1' } }],
        },
      ],
    })
    const map = elements(spec)
    const root = (spec as { root: string }).root
    expect(map[root].type).toBe('Page')
    expect(map[root].children).toHaveLength(1)
    const section = map[map[root].children[0]]
    expect(section.type).toBe('Section')
    const heading = map[section.children[0]]
    expect(heading).toEqual({
      type: 'Heading',
      props: { text: 'Hello', level: 'h1' },
      children: [],
    })
  })

  it('flattens nested object children found inside a flat elements map', () => {
    const spec = normalizeGeneratedSpec({
      root: 'page',
      elements: {
        page: {
          type: 'Page',
          props: {},
          children: [{ type: 'Heading', props: { text: 'Inline' } }],
        },
      },
    })
    const map = elements(spec)
    expect(map.page.children).toHaveLength(1)
    expect(typeof map.page.children[0]).toBe('string')
    expect(map[map.page.children[0]].type).toBe('Heading')
  })

  it('wraps a non-Page root in a Page and a Section', () => {
    const spec = normalizeGeneratedSpec({
      type: 'Container',
      props: { direction: 'column', gap: 'lg' },
      children: [],
    })
    const map = elements(spec)
    const root = (spec as { root: string }).root
    expect(map[root].type).toBe('Page')
    const section = map[map[root].children[0]]
    expect(section.type).toBe('Section')
    expect(map[section.children[0]].type).toBe('Stack')
  })

  it('wraps a Section root in a Page without adding a second Section', () => {
    const spec = normalizeGeneratedSpec({
      type: 'Section',
      props: { width: 'narrow' },
      children: [],
    })
    const map = elements(spec)
    const sections = Object.values(map).filter((element) => element.type === 'Section')
    expect(sections).toHaveLength(1)
    expect(map[(spec as { root: string }).root].type).toBe('Page')
  })

  it('picks the Page element as root when root is missing', () => {
    const spec = normalizeGeneratedSpec({
      elements: {
        heading: { type: 'Heading', props: { text: 'Hi' }, children: [] },
        shell: { type: 'Page', props: {}, children: ['heading'] },
      },
    })
    expect((spec as { root: string }).root).toBe('shell')
  })

  it.each([
    ['Container', 'Stack'],
    ['Box', 'Stack'],
    ['Metric', 'Stat'],
    ['KPI', 'Stat'],
    ['InputField', 'TextInput'],
    ['Input', 'TextInput'],
    ['SelectField', 'Select'],
    ['Dropdown', 'Select'],
    ['Textarea', 'TextArea'],
    ['NumberField', 'NumberInput'],
    ['DatePicker', 'DateInput'],
    ['RadioButtons', 'RadioGroup'],
    ['Toggle', 'Switch'],
    ['CheckboxField', 'Checkbox'],
    ['TagSelect', 'MultiSelect'],
    ['Paragraph', 'Text'],
    ['Loader', 'Skeleton'],
    ['Loading', 'Skeleton'],
    ['ForEach', 'Repeat'],
    ['Collection', 'Repeat'],
    ['Search', 'SearchField'],
    ['Tag', 'Chip'],
    ['Logo', 'Avatar'],
    ['Progress', 'ProgressBar'],
    ['HeroHeader', 'PageHeader'],
    ['StatusCard', 'WorkingCard'],
    ['LoadingCard', 'WorkingCard'],
    ['Dialog', 'Modal'],
    ['FilterBar', 'Filter'],
    ['Notification', 'Toast'],
    ['Sheet', 'Drawer'],
  ])('aliases %s to %s', (alias, canonical) => {
    const spec = normalizeGeneratedSpec({
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['target'] },
        target: { type: alias, props: {}, children: [] },
      },
    })
    expect(elements(spec).target.type).toBe(canonical)
  })

  it('moves ForEach items onto Repeat statePath', () => {
    const spec = normalizeGeneratedSpec({
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['list'] },
        list: { type: 'ForEach', props: { items: 'articles' }, children: [] },
      },
    })
    expect(elements(spec).list.type).toBe('Repeat')
    expect(elements(spec).list.props.statePath).toBe('articles')
  })

  it('leaves an unknown component type in place so validation still reports it', () => {
    const spec = normalizeGeneratedSpec({
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['widget'] },
        widget: { type: 'UnknownWidget', props: {}, children: [] },
      },
    })
    expect(elements(spec).widget.type).toBe('UnknownWidget')
    expect(arenaGenerativeUiCatalog.validate(spec).success).toBe(false)
  })

  it('aliases Chart onto Sparkline', () => {
    const spec = normalizeGeneratedSpec({
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['chart'] },
        chart: { type: 'Chart', props: { values: '1,2,3' }, children: [] },
      },
    })
    expect(elements(spec).chart.type).toBe('Sparkline')
  })

  it('resolves spacing tokens to CSS lengths and passes raw lengths through', () => {
    const spec = normalizeGeneratedSpec({
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['a', 'b', 'c'] },
        a: { type: 'Stack', props: { gap: 'lg' }, children: [] },
        b: { type: 'Section', props: { padding: 'md' }, children: [] },
        c: { type: 'Stack', props: { gap: '18px' }, children: [] },
      },
    })
    expect(elements(spec).a.props.gap).toBe('24px')
    expect(elements(spec).b.props.padding).toBe('16px')
    expect(elements(spec).c.props.gap).toBe('18px')
  })

  it('maps column and row directions onto the catalog vocabulary', () => {
    const spec = normalizeGeneratedSpec({
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['col', 'row'] },
        col: { type: 'Stack', props: { direction: 'column' }, children: [] },
        row: { type: 'Stack', props: { direction: 'row' }, children: [] },
      },
    })
    expect(elements(spec).col.props.direction).toBe('vertical')
    expect(elements(spec).row.props.direction).toBe('horizontal')
  })

  it('collapses a responsive Grid cols map to the widest clamped track count', () => {
    const spec = normalizeGeneratedSpec({
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['a', 'b', 'c'] },
        a: { type: 'Grid', props: { cols: { default: 1, md: 3 } }, children: [] },
        b: { type: 'Grid', props: { cols: 1 }, children: [] },
        c: { type: 'Grid', props: { cols: 12 }, children: [] },
      },
    })
    expect(elements(spec).a.props.columns).toBe('3')
    expect(elements(spec).a.props.cols).toBeUndefined()
    expect(elements(spec).b.props.columns).toBe('2')
    expect(elements(spec).c.props.columns).toBe('4')
  })

  it('moves Metric title and trend data onto Stat props', () => {
    const spec = normalizeGeneratedSpec({
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['metric'] },
        metric: {
          type: 'Metric',
          props: { title: 'Total reports compiled' },
          data: { value: 12_480, trend: { value: '+14.2%', isPositive: true } },
          children: [],
        },
      },
    })
    expect(elements(spec).metric).toMatchObject({
      type: 'Stat',
      props: {
        label: 'Total reports compiled',
        value: '12480',
        delta: '+14.2%',
        deltaTone: 'positive',
      },
    })
  })

  it('marks a falling trend as negative', () => {
    const spec = normalizeGeneratedSpec({
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['metric'] },
        metric: {
          type: 'Metric',
          props: { title: 'Errors' },
          data: { value: '3', trend: { value: '-2', isPositive: false } },
          children: [],
        },
      },
    })
    expect(elements(spec).metric.props.deltaTone).toBe('negative')
  })

  it('turns Form submitLabel into a SubmitButton child', () => {
    const spec = normalizeGeneratedSpec({
      type: 'Form',
      props: { actionId: 'compile_report', submitLabel: 'Execute run' },
      children: [{ type: 'InputField', props: { name: 'batchName', label: 'Batch' } }],
    })
    const form = findByType(spec, 'Form')
    expect(form?.props.submitLabel).toBeUndefined()
    const submit = findByType(spec, 'SubmitButton')
    expect(submit?.props.label).toBe('Execute run')
    expect(form?.children).toContain(
      Object.keys(elements(spec)).find((key) => elements(spec)[key] === submit)
    )
  })

  it('does not add a second SubmitButton when the form already has one', () => {
    const spec = normalizeGeneratedSpec({
      type: 'Form',
      props: { actionId: 'compile_report', submitLabel: 'Execute run' },
      children: [{ type: 'SubmitButton', props: { label: 'Go' } }],
    })
    const submits = Object.values(elements(spec)).filter(
      (element) => element.type === 'SubmitButton'
    )
    expect(submits).toHaveLength(1)
    expect(submits[0].props.label).toBe('Go')
  })

  it('does not introduce a submitLabel key on forms that lacked one', () => {
    const spec = normalizeGeneratedSpec({
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['form'] },
        form: { type: 'Form', props: { actionId: 'run' }, children: [] },
      },
    })
    expect('submitLabel' in elements(spec).form.props).toBe(false)
  })

  it('joins Select options objects into a comma-separated string', () => {
    const spec = normalizeGeneratedSpec({
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['priority'] },
        priority: {
          type: 'SelectField',
          props: {
            name: 'priority',
            label: 'Execution priority',
            options: [
              { label: 'Standard processing', value: 'std' },
              { label: 'High priority expedited', value: 'high' },
            ],
          },
          children: [],
        },
      },
    })
    expect(elements(spec).priority.props.options).toBe(
      'Standard processing, High priority expedited'
    )
  })

  it('joins RadioGroup and MultiSelect options arrays the same way', () => {
    const spec = normalizeGeneratedSpec({
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['channel', 'tags'] },
        channel: {
          type: 'RadioButtons',
          props: { name: 'channel', options: [{ label: 'Email' }, { label: 'SMS' }] },
          children: [],
        },
        tags: {
          type: 'TagSelect',
          props: { name: 'tags', options: ['alpha', 'beta'] },
          children: [],
        },
      },
    })
    expect(elements(spec).channel.type).toBe('RadioGroup')
    expect(elements(spec).channel.props.options).toBe('Email, SMS')
    expect(elements(spec).tags.type).toBe('MultiSelect')
    expect(elements(spec).tags.props.options).toBe('alpha, beta')
  })

  it('joins Table columns and rows arrays into the string encodings', () => {
    const spec = normalizeGeneratedSpec({
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['table'] },
        table: {
          type: 'Table',
          props: {
            columns: [{ key: 'time' }, { label: 'Records' }],
            rows: [['10:00', '1200'], { time: '11:00', rps: '1450' }],
          },
          children: [],
        },
      },
    })
    expect(elements(spec).table.props.columns).toBe('time, Records')
    expect(elements(spec).table.props.rows).toBe('10:00 | 1200\n11:00 | 1450')
  })

  it('joins Tabs items, KeyValue items, and ProgressSteps steps arrays', () => {
    const spec = normalizeGeneratedSpec({
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['tabs', 'meta', 'steps'] },
        tabs: {
          type: 'Tabs',
          props: {
            items: [
              { label: 'Home', path: 'home' },
              { label: 'Report', to: 'report' },
            ],
          },
          children: [],
        },
        meta: { type: 'KeyValue', props: { items: { source: 'arena', runs: 3 } }, children: [] },
        steps: { type: 'ProgressSteps', props: { steps: ['Connecting', 'Ranking'] }, children: [] },
      },
    })
    expect(elements(spec).tabs.props.items).toBe('Home|home\nReport|report')
    expect(elements(spec).meta.props.items).toBe('source: arena\nruns: 3')
    expect(elements(spec).steps.props.steps).toBe('Connecting\nRanking')
  })

  it('renames content to text on markdown-rendering components', () => {
    const spec = normalizeGeneratedSpec({
      root: 'page',
      elements: {
        page: { type: 'Page', props: {}, children: ['body'] },
        body: { type: 'Paragraph', props: { content: 'Hello there' }, children: [] },
      },
    })
    expect(elements(spec).body).toMatchObject({ type: 'Text', props: { text: 'Hello there' } })
  })

  it('normalizes the full master-template shape into a validating spec', () => {
    const spec = normalizeGeneratedSpec({
      type: 'Container',
      props: { direction: 'column', gap: 'lg' },
      children: [
        {
          type: 'Grid',
          props: { cols: { default: 1, md: 3 }, gap: 'md' },
          children: [
            {
              type: 'Metric',
              props: { title: 'Total Reports Compiled' },
              data: { value: '12,480', trend: { value: '+14.2%', isPositive: true } },
            },
          ],
        },
        {
          type: 'Card',
          props: { title: 'System Parameters', description: 'Configure compilation parameters.' },
          children: [
            {
              type: 'Form',
              props: { submitLabel: 'Execute Run' },
              children: [
                {
                  type: 'InputField',
                  props: { name: 'batchName', label: 'Batch Target Identifier', required: true },
                },
                {
                  type: 'SelectField',
                  props: {
                    name: 'priority',
                    label: 'Execution Priority',
                    options: [{ label: 'Standard Processing', value: 'std' }],
                  },
                },
              ],
            },
          ],
        },
      ],
    })
    expect(spec).not.toBeNull()
    expect(arenaGenerativeUiCatalog.validate(spec).success).toBe(true)
  })

  describe('layout value coercion', () => {
    function stackProps(props: Record<string, unknown>): Record<string, unknown> {
      const spec = normalizeGeneratedSpec({
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['row'] },
          row: { type: 'Stack', props, children: [] },
        },
      })
      return elements(spec).row.props
    }

    it('maps CSS flexbox justify spellings onto the catalog enum', () => {
      expect(stackProps({ justify: 'space-between' }).justify).toBe('between')
      expect(stackProps({ justify: 'flex-start' }).justify).toBe('start')
      expect(stackProps({ justify: 'flex-end' }).justify).toBe('end')
      expect(stackProps({ justify: 'centre' }).justify).toBe('center')
    })

    it('maps CSS flexbox align spellings onto the catalog enum', () => {
      expect(stackProps({ align: 'flex-end' }).align).toBe('end')
      expect(stackProps({ align: 'top' }).align).toBe('start')
      expect(stackProps({ align: 'centre' }).align).toBe('center')
    })

    it('leaves catalog values and unrelated props alone', () => {
      expect(stackProps({ justify: 'center', align: 'stretch' })).toMatchObject({
        justify: 'center',
        align: 'stretch',
      })
      expect(stackProps({ justify: 'nonsense' }).justify).toBe('nonsense')
    })

    it('centres a search row that used CSS spellings', () => {
      const spec = normalizeGeneratedSpec({
        root: 'page',
        elements: {
          page: { type: 'Page', props: {}, children: ['form'] },
          form: { type: 'Form', props: { actionId: 'search', align: 'centre' }, children: ['row'] },
          row: {
            type: 'Stack',
            props: { direction: 'row', justify: 'space-between', align: 'flex-end' },
            children: [],
          },
        },
      })
      expect(elements(spec).form.props.align).toBe('center')
      expect(elements(spec).row.props).toMatchObject({
        direction: 'horizontal',
        justify: 'between',
        align: 'end',
      })
      expect(arenaGenerativeUiCatalog.validate(spec).success).toBe(true)
    })
  })
})

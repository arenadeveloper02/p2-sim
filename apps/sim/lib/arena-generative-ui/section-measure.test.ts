/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  sectionIsMeasureOnly,
  sectionWidthNeedsMeasure,
} from '@/lib/arena-generative-ui/section-measure'

describe('sectionIsMeasureOnly', () => {
  it('treats a SearchField hero as measure-only', () => {
    const elements = {
      header: { type: 'PageHeader', props: {}, children: [] },
      search: { type: 'SearchField', props: {}, children: [] },
    }
    expect(sectionIsMeasureOnly(elements, ['header', 'search'])).toBe(true)
  })

  it('treats a stacked Form as measure-only', () => {
    const elements = {
      form: { type: 'Form', props: {}, children: ['url'] },
      url: { type: 'TextInput', props: {}, children: [] },
    }
    expect(sectionIsMeasureOnly(elements, ['form'])).toBe(true)
  })

  it('does not narrow a Form beside a Table', () => {
    const elements = {
      form: { type: 'Form', props: {}, children: ['q'] },
      q: { type: 'TextInput', props: {}, children: [] },
      table: { type: 'Table', props: {}, children: [] },
    }
    expect(sectionIsMeasureOnly(elements, ['form', 'table'])).toBe(false)
  })

  it('ignores a Form inside Modal', () => {
    const elements = {
      open: { type: 'Button', props: {}, children: [] },
      modal: { type: 'Modal', props: {}, children: ['form'] },
      form: { type: 'Form', props: {}, children: ['name'] },
      name: { type: 'TextInput', props: {}, children: [] },
    }
    expect(sectionIsMeasureOnly(elements, ['open', 'modal'])).toBe(false)
  })
})

describe('sectionWidthNeedsMeasure', () => {
  it('flags omitted and wide, not narrow or full', () => {
    expect(sectionWidthNeedsMeasure(undefined)).toBe(true)
    expect(sectionWidthNeedsMeasure('wide')).toBe(true)
    expect(sectionWidthNeedsMeasure('narrow')).toBe(false)
    expect(sectionWidthNeedsMeasure('full')).toBe(false)
  })
})

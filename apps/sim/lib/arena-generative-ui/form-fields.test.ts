/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  collectVisibleFieldValues,
  fieldIsVisible,
  formValuesFromRecord,
  listFormFields,
  omitFormFieldValues,
  overlayClosePatch,
  overlayOpenPatch,
  overlayShowWhenUsesSelection,
  parseShowWhen,
  resolveFieldValue,
  validateVisibleFields,
} from '@/lib/arena-generative-ui/form-fields'

describe('parseShowWhen', () => {
  it('treats a bare name as a truthy check', () => {
    expect(parseShowWhen('notify')).toEqual([{ name: 'notify', op: 'truthy' }])
  })

  it('parses a leading bang as a falsy check', () => {
    expect(parseShowWhen('!selectedId')).toEqual([{ name: 'selectedId', op: 'falsy' }])
  })
})

describe('fieldIsVisible', () => {
  it('is visible when showWhen is empty', () => {
    expect(fieldIsVisible({}, {})).toBe(true)
  })

  it('requires every clause to match', () => {
    expect(
      fieldIsVisible({ showWhen: 'notify,channel=email' }, { notify: true, channel: 'email' })
    ).toBe(true)
    expect(
      fieldIsVisible({ showWhen: 'notify,channel=email' }, { notify: true, channel: 'sms' })
    ).toBe(false)
    expect(fieldIsVisible({ showWhen: '!selectedId' }, {})).toBe(true)
    expect(fieldIsVisible({ showWhen: '!selectedId' }, { selectedId: 'run_1' })).toBe(false)
  })
})

describe('overlay showWhen patches', () => {
  it('opens a truthy flag and equality clause', () => {
    expect(overlayOpenPatch('creating')).toEqual({ creating: true })
    expect(overlayOpenPatch('mode=create')).toEqual({ mode: 'create' })
  })

  it('cannot open a falsy clause', () => {
    expect(overlayOpenPatch('!selectedId')).toBeNull()
  })

  it('closes truthy and equality clauses with an empty value', () => {
    expect(overlayClosePatch('creating')).toEqual({ creating: '' })
    expect(overlayClosePatch('!selectedId')).toEqual({})
  })

  it('treats selectedId overlays as selection chrome', () => {
    expect(overlayShowWhenUsesSelection('selectedId')).toBe(true)
    expect(overlayShowWhenUsesSelection('creating')).toBe(false)
  })
})

describe('resolveFieldValue', () => {
  it('prefers a user edit over state and defaults', () => {
    expect(
      resolveFieldValue(
        'TextInput',
        { name: 'company', defaultValue: 'Acme', statePath: 'company' },
        { company: 'Ada' },
        { company: 'From state' }
      )
    ).toBe('Ada')
  })

  it('reads statePath before defaultValue', () => {
    expect(
      resolveFieldValue(
        'TextInput',
        { name: 'company', defaultValue: 'Acme', statePath: 'company' },
        {},
        { company: 'From state' }
      )
    ).toBe('From state')
  })

  it('defaults Checkbox from defaultChecked', () => {
    expect(resolveFieldValue('Checkbox', { name: 'agree', defaultChecked: true }, {}, {})).toBe(
      true
    )
    expect(resolveFieldValue('Switch', { name: 'notify', defaultValue: 'true' }, {}, {})).toBe(true)
  })
})

describe('listFormFields', () => {
  it('walks nested layout children and skips non-fields', () => {
    const fields = listFormFields(
      {
        grid: { type: 'Grid', props: {}, children: ['name', 'agree'] },
        name: { type: 'TextInput', props: { name: 'name' }, children: [] },
        agree: { type: 'Checkbox', props: { name: 'agree' }, children: [] },
        submit: { type: 'SubmitButton', props: { label: 'Go' }, children: [] },
      },
      ['grid', 'submit']
    )
    expect(fields.map((field) => field.props.name)).toEqual(['name', 'agree'])
  })
})

describe('validateVisibleFields', () => {
  it('requires a visible empty text field', () => {
    const errors = validateVisibleFields(
      [{ type: 'TextInput', props: { name: 'name', label: 'Name', required: true } }],
      {},
      {}
    )
    expect(errors.name).toBe('Name is required')
  })

  it('uses errorText and skips hidden fields', () => {
    const errors = validateVisibleFields(
      [
        {
          type: 'TextInput',
          props: {
            name: 'email',
            label: 'Email',
            required: true,
            showWhen: 'notify',
            errorText: 'Add an email',
          },
        },
      ],
      { notify: false },
      {}
    )
    expect(errors).toEqual({})
  })

  it('enforces NumberInput min and max', () => {
    const field = {
      type: 'NumberInput' as const,
      props: { name: 'count', label: 'Count', min: '2', max: '5' },
    }
    expect(validateVisibleFields([field], { count: '1' }, {}).count).toContain('at least 2')
    expect(validateVisibleFields([field], { count: '9' }, {}).count).toContain('at most 5')
    expect(validateVisibleFields([field], { count: '3' }, {})).toEqual({})
  })
})

describe('collectVisibleFieldValues', () => {
  it('omits hidden fields and coerces checkbox / number / multiselect', () => {
    const values = collectVisibleFieldValues(
      [
        { type: 'Switch', props: { name: 'notify', defaultChecked: true } },
        { type: 'TextInput', props: { name: 'email', showWhen: 'notify' } },
        { type: 'NumberInput', props: { name: 'count', defaultValue: '4' } },
        {
          type: 'MultiSelect',
          props: { name: 'tags', defaultValue: 'a, b', showWhen: 'notify=false' },
        },
      ],
      { email: 'ada@example.com' },
      {}
    )
    expect(values).toEqual({
      notify: true,
      email: 'ada@example.com',
      count: 4,
    })
  })
})

describe('formValuesFromRecord', () => {
  const fields = [{ type: 'TextInput' as const, props: { name: 'title' } }]

  it('copies matching keys and accepts case-insensitive names', () => {
    expect(formValuesFromRecord({ Title: 'Ship', id: 'i1' }, fields)).toEqual({ title: 'Ship' })
    expect(formValuesFromRecord({ title: 'Ship', id: 'i1' }, fields)).toEqual({
      title: 'Ship',
    })
  })

  it('does not invent keys the record lacks', () => {
    expect(formValuesFromRecord({ id: 'i1' }, fields)).toEqual({})
  })
})

describe('omitFormFieldValues', () => {
  it('drops overlay field names and leaves other keys', () => {
    expect(
      omitFormFieldValues(
        { title: 'Ship', query: 'alpha' },
        [{ type: 'TextInput', props: { name: 'title' } }]
      )
    ).toEqual({ query: 'alpha' })
  })
})

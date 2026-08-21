/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  applyBindingInputSources,
  applyInputSourceOverrides,
  inferInputFieldSource,
  inputFieldRowNeedsValue,
  resolveInputFieldEditorRow,
} from '@/lib/arena-generative-ui/input-schema'

describe('inferInputFieldSource', () => {
  it('treats email-like names as visitorEmail', () => {
    expect(inferInputFieldSource('email')).toBe('visitorEmail')
    expect(inferInputFieldSource('userEmail')).toBe('visitorEmail')
    expect(inferInputFieldSource('user_email')).toBe('visitorEmail')
    expect(inferInputFieldSource('loggedInEmail')).toBe('visitorEmail')
  })

  it('treats a description that names email as visitorEmail', () => {
    expect(inferInputFieldSource('actor', "Logged-in user's email")).toBe('visitorEmail')
  })

  it('leaves ordinary start inputs as form', () => {
    expect(inferInputFieldSource('type')).toBe('form')
    expect(inferInputFieldSource('company', 'Legal name')).toBe('form')
  })
})

describe('applyInputSourceOverrides', () => {
  it('keeps inferred visitorEmail when the user does not override', () => {
    expect(
      applyInputSourceOverrides(
        [
          { name: 'type', type: 'string' },
          { name: 'email', type: 'string', source: 'visitorEmail' },
        ],
        {}
      )
    ).toEqual([
      { name: 'type', type: 'string' },
      { name: 'email', type: 'string', source: 'visitorEmail' },
    ])
  })

  it('stores a constant value and can revert email to a form field', () => {
    expect(
      applyInputSourceOverrides(
        [
          { name: 'type', type: 'string' },
          { name: 'email', type: 'string', source: 'visitorEmail' },
        ],
        {
          type: { source: 'constant', value: 'history' },
          email: { source: 'form' },
        }
      )
    ).toEqual([
      { name: 'type', type: 'string', source: 'constant', value: 'history' },
      { name: 'email', type: 'string' },
    ])
  })
})

describe('applyBindingInputSources', () => {
  it('fills visitorEmail and constant when the form payload is empty', () => {
    expect(
      applyBindingInputSources(
        {},
        {
          inputSchema: [
            { name: 'type', type: 'string', source: 'constant', value: 'history' },
            { name: 'email', type: 'string', source: 'visitorEmail' },
          ],
        },
        'ada@example.com'
      )
    ).toEqual({ type: 'history', email: 'ada@example.com' })
  })

  it('does not invent an email when none was resolved', () => {
    expect(
      applyBindingInputSources(
        { name: 'Ada' },
        { inputSchema: [{ name: 'email', type: 'string', source: 'visitorEmail' }] }
      )
    ).toEqual({ name: 'Ada' })
  })

  it('leaves form-sourced fields as submitted', () => {
    expect(
      applyBindingInputSources(
        { company: 'Acme' },
        { inputSchema: [{ name: 'company', type: 'string' }] },
        'ada@example.com'
      )
    ).toEqual({ company: 'Acme' })
  })
})

describe('resolveInputFieldEditorRow', () => {
  it('builds the Add-an-API row from inferred source plus override', () => {
    expect(
      resolveInputFieldEditorRow(
        { name: 'email', type: 'string', source: 'visitorEmail' },
        undefined
      )
    ).toEqual({ name: 'email', type: 'string', source: 'visitorEmail', value: '' })

    expect(
      resolveInputFieldEditorRow(
        { name: 'type', type: 'string' },
        { source: 'constant', value: 'history' }
      )
    ).toEqual({ name: 'type', type: 'string', source: 'constant', value: 'history' })
  })

  it('flags a constant with no value', () => {
    expect(
      inputFieldRowNeedsValue({ name: 'type', type: 'string', source: 'constant', value: '  ' })
    ).toBe(true)
    expect(
      inputFieldRowNeedsValue({
        name: 'type',
        type: 'string',
        source: 'constant',
        value: 'history',
      })
    ).toBe(false)
  })
})

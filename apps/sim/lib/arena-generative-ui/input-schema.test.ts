/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  applyBindingInputSources,
  applyInputSourceOverrides,
  briefHasEmailFormField,
  inferInputFieldSource,
  inputFieldRowNeedsValue,
  inputSourceOverridesForSave,
  isEmailLikeApiInputName,
  resolveInputFieldEditorRow,
} from '@/lib/arena-generative-ui/input-schema'

describe('inferInputFieldSource', () => {
  it('treats actor-specific names as the signed-in address', () => {
    expect(inferInputFieldSource('userEmail')).toBe('visitorEmail')
    expect(inferInputFieldSource('user_email')).toBe('visitorEmail')
    expect(inferInputFieldSource('loggedInEmail')).toBe('visitorEmail')
    expect(inferInputFieldSource('visitorEmail')).toBe('visitorEmail')
    expect(inferInputFieldSource('arenaEmailId')).toBe('visitorEmail')
  })

  it('keeps a field named email as a typed form value', () => {
    expect(inferInputFieldSource('email')).toBe('form')
    expect(inferInputFieldSource('e-mail')).toBe('form')
    expect(inferInputFieldSource('contactEmail')).toBe('form')
  })

  it('leaves ordinary start inputs as form', () => {
    expect(inferInputFieldSource('type')).toBe('form')
    expect(inferInputFieldSource('company')).toBe('form')
    expect(inferInputFieldSource('actor')).toBe('form')
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

  it('does not overwrite a typed lead email with the signed-in address', () => {
    expect(
      applyBindingInputSources(
        { email: 'lead@acme.com' },
        { inputSchema: [{ name: 'email', type: 'string' }] },
        'ada@example.com'
      )
    ).toEqual({ email: 'lead@acme.com' })
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

describe('isEmailLikeApiInputName', () => {
  it('treats email and emailId as address inputs', () => {
    expect(isEmailLikeApiInputName('email')).toBe(true)
    expect(isEmailLikeApiInputName('e-mail')).toBe(true)
    expect(isEmailLikeApiInputName('emailId')).toBe(true)
    expect(isEmailLikeApiInputName('email_id')).toBe(true)
    expect(isEmailLikeApiInputName('userEmail')).toBe(true)
    expect(isEmailLikeApiInputName('arenaEmailId')).toBe(true)
  })

  it('leaves lead and ordinary names alone', () => {
    expect(isEmailLikeApiInputName('contactEmail')).toBe(false)
    expect(isEmailLikeApiInputName('company')).toBe(false)
    expect(isEmailLikeApiInputName('targetKeyword')).toBe(false)
  })
})

describe('briefHasEmailFormField', () => {
  it('returns false for an empty brief or a form without email', () => {
    expect(briefHasEmailFormField('')).toBe(false)
    expect(briefHasEmailFormField('  ')).toBe(false)
    expect(briefHasEmailFormField('- Target Keyword (text)\n- Client / Brand')).toBe(false)
  })

  it('returns false for marketing copy that only mentions emailing', () => {
    expect(briefHasEmailFormField('we will email results when the run finishes')).toBe(false)
    expect(briefHasEmailFormField('Turn on email notifications for this workspace.')).toBe(false)
  })

  it('detects field-declaration phrasing', () => {
    expect(briefHasEmailFormField('- email (text) — placeholder "you@acme.com"')).toBe(true)
    expect(briefHasEmailFormField('Email address — placeholder "you@acme.com"')).toBe(true)
    expect(briefHasEmailFormField('Fields:\n- userEmail\n- company')).toBe(true)
    expect(briefHasEmailFormField('Add a contactEmail field on the form.')).toBe(true)
  })
})

describe('inputSourceOverridesForSave', () => {
  const fields = [{ name: 'email' }, { name: 'targetKeyword' }, { name: 'type' }]

  it('stamps visitorEmail on email-like inputs when the brief has no email field', () => {
    expect(
      inputSourceOverridesForSave(fields, '- Target Keyword (text)', {
        type: { source: 'constant', value: 'history' },
      })
    ).toEqual({
      type: { source: 'constant', value: 'history' },
      email: { source: 'visitorEmail' },
    })
  })

  it('does not stamp when the brief declares an email field', () => {
    expect(
      inputSourceOverridesForSave(fields, '- email (text)\n- Target Keyword', {
        type: { source: 'constant', value: 'history' },
      })
    ).toEqual({
      type: { source: 'constant', value: 'history' },
    })
  })
})

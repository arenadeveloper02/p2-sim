/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  applyBindingInputSources,
  applyInputSourceOverrides,
  bindingWithInputOverrides,
  briefHasEmailFormField,
  constrainBindingInput,
  inferInputFieldSource,
  inputFieldRowNeedsValue,
  inputSourceOverridesForSave,
  isChatInputPrefixName,
  isEmailLikeApiInputName,
  isFormFacingInputSchemaField,
  isOmittedGenerativeInputField,
  isReservedStartInputName,
  resolveInputFieldEditorRow,
} from '@/lib/arena-generative-ui/input-schema'

describe('isReservedStartInputName', () => {
  it('matches chat start-block protocol fields case-insensitively', () => {
    expect(isReservedStartInputName('input')).toBe(true)
    expect(isReservedStartInputName('conversationId')).toBe(true)
    expect(isReservedStartInputName('files')).toBe(true)
    expect(isReservedStartInputName('Files')).toBe(true)
    expect(isReservedStartInputName('keyword')).toBe(false)
    expect(isReservedStartInputName('email')).toBe(false)
  })

  it('identifies the chat input prefix name', () => {
    expect(isChatInputPrefixName('input')).toBe(true)
    expect(isChatInputPrefixName('INPUT')).toBe(true)
    expect(isChatInputPrefixName('company_name')).toBe(false)
  })

  it('treats only visitor form fields as Add-an-API tags', () => {
    expect(isFormFacingInputSchemaField({ name: 'company' })).toBe(true)
    expect(isFormFacingInputSchemaField({ name: 'input' })).toBe(false)
    expect(isFormFacingInputSchemaField({ name: 'conversationId' })).toBe(false)
    expect(isFormFacingInputSchemaField({ name: 'files' })).toBe(false)
  })
})

describe('isOmittedGenerativeInputField', () => {
  it('omits reserved names, execute flags, and file[] uploads', () => {
    expect(isOmittedGenerativeInputField({ name: 'files' })).toBe(true)
    expect(isOmittedGenerativeInputField({ name: 'stream' })).toBe(true)
    expect(isOmittedGenerativeInputField({ name: 'includeThinking' })).toBe(true)
    expect(isOmittedGenerativeInputField({ name: 'includeToolCalls' })).toBe(true)
    expect(isOmittedGenerativeInputField({ name: 'attachments', type: 'file[]' })).toBe(true)
    expect(isOmittedGenerativeInputField({ name: 'keyword' })).toBe(false)
    expect(isOmittedGenerativeInputField({ name: 'tags', type: 'array' })).toBe(false)
  })

  it('omits curl file-object arrays but keeps ordinary object arrays', () => {
    expect(
      isOmittedGenerativeInputField({ name: 'attachments' }, [
        { type: 'file', name: 'doc.pdf', mime: 'application/pdf', data: 'abc' },
      ])
    ).toBe(true)
    expect(
      isOmittedGenerativeInputField({ name: 'articles' }, [
        { title: 'Ada', url: 'https://example.com' },
      ])
    ).toBe(false)
  })
})

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

  it('locks Start input to a constant prefix', () => {
    expect(inferInputFieldSource('input')).toBe('constant')
    expect(inferInputFieldSource('INPUT')).toBe('constant')
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

  it('drops an empty chat prefix and ignores a form override on input', () => {
    expect(
      applyInputSourceOverrides([{ name: 'input', type: 'string', source: 'constant' }], {
        input: { source: 'form' },
      })
    ).toEqual([])
  })

  it('stores a typed chat prefix even when inputSchema is otherwise empty', () => {
    expect(
      applyInputSourceOverrides([], {
        input: { source: 'constant', value: 'Research ' },
      })
    ).toEqual([{ name: 'input', type: 'string', source: 'constant', value: 'Research' }])
  })

  it('keeps an existing prefix value when the user does not override it', () => {
    expect(
      applyInputSourceOverrides(
        [{ name: 'input', type: 'string', source: 'constant', value: 'Hello ' }],
        {}
      )
    ).toEqual([{ name: 'input', type: 'string', source: 'constant', value: 'Hello' }])
  })

  it('omits inputSchema on a reserved-only binding unless a prefix is typed', () => {
    const reservedOnly = {
      key: 'chat',
      label: 'chat',
      kind: 'workflow' as const,
      workflowId: 'wf-1',
      chatProtocol: { input: true, conversationId: true, files: true },
    }
    expect(bindingWithInputOverrides(reservedOnly, {}).inputSchema).toBeUndefined()
    expect(
      bindingWithInputOverrides(reservedOnly, {
        input: { source: 'constant', value: 'Lead with ' },
      }).inputSchema
    ).toEqual([{ name: 'input', type: 'string', source: 'constant', value: 'Lead with' }])
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

  it('does not stamp the input prefix constant onto the payload', () => {
    expect(
      applyBindingInputSources(
        { company: 'Acme' },
        {
          inputSchema: [
            { name: 'input', type: 'string', source: 'constant', value: 'Research ' },
            { name: 'company', type: 'string' },
          ],
        }
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

describe('constrainBindingInput', () => {
  it('keeps the payload when the binding has no inputSchema', () => {
    expect(constrainBindingInput({ name: 'Ada', notes: 'x' }, {})).toEqual({
      name: 'Ada',
      notes: 'x',
    })
  })

  it('drops keys the binding did not declare', () => {
    expect(
      constrainBindingInput(
        { company: 'Acme', notes: 'secret', debug: true },
        { inputSchema: [{ name: 'company', type: 'string' }] }
      )
    ).toEqual({ company: 'Acme' })
  })

  it('allows reserved chat keys when the binding declares chatProtocol', () => {
    expect(
      constrainBindingInput(
        { company: 'Acme', input: 'hello', conversationId: 'c1', files: [], extra: 1 },
        {
          inputSchema: [{ name: 'company', type: 'string' }],
          chatProtocol: { input: true, conversationId: true, files: true },
        }
      )
    ).toEqual({ company: 'Acme', input: 'hello', conversationId: 'c1', files: [] })
  })

  it('keeps pagination params and mapping sources', () => {
    expect(
      constrainBindingInput(
        { company: 'Acme', notes: 'x', nextCursor: 'abc', limit: 20 },
        { inputSchema: [{ name: 'company', type: 'string' }] },
        { companyName: 'company' }
      )
    ).toEqual({ company: 'Acme', nextCursor: 'abc', limit: 20 })
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
    expect(
      inputFieldRowNeedsValue({ name: 'input', type: 'string', source: 'constant', value: '' })
    ).toBe(false)
  })

  it('locks the input prefix row to constant', () => {
    expect(
      resolveInputFieldEditorRow({ name: 'input', type: 'string' }, { source: 'form' })
    ).toEqual({ name: 'input', type: 'string', source: 'constant', value: '' })
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

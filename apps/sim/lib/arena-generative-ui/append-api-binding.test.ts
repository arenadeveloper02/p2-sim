/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  appendApiBinding,
  INVALID_EXISTING_BINDINGS_MESSAGE,
  removeApiBinding,
} from '@/lib/arena-generative-ui/append-api-binding'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'

const qualify: ArenaGenerativeApiBinding = {
  key: 'qualify_lead',
  label: 'qualify_lead',
  kind: 'http',
  http: { method: 'POST', url: 'https://api.example.com/qualify' },
}

const lookup: ArenaGenerativeApiBinding = {
  key: 'crm_lookup',
  label: 'crm_lookup',
  kind: 'http',
  http: { method: 'GET', url: 'https://api.example.com/lookup' },
}

describe('appendApiBinding', () => {
  it('starts a new array when the field is empty', () => {
    const started = JSON.stringify([qualify], null, 2)
    expect(appendApiBinding('', qualify)).toBe(started)
    expect(appendApiBinding('[]', qualify)).toBe(started)
    expect(appendApiBinding('{}', qualify)).toBe(started)
    expect(appendApiBinding(null, qualify)).toBe(started)
  })

  it('appends a second binding', () => {
    const existing = JSON.stringify([qualify])
    expect(JSON.parse(appendApiBinding(existing, lookup))).toEqual([qualify, lookup])
  })

  it('replaces an existing binding with the same key', () => {
    const updated: ArenaGenerativeApiBinding = {
      ...qualify,
      http: {
        method: 'POST',
        url: 'https://api.example.com/qualify-v2',
        headersSecretName: 'CRM_API_TOKEN',
      },
    }
    const existing = JSON.stringify([qualify, lookup])
    expect(JSON.parse(appendApiBinding(existing, updated))).toEqual([lookup, updated])
  })

  it('does not overwrite the textarea when existing JSON is invalid', () => {
    expect(() => appendApiBinding('not json', qualify)).toThrow(INVALID_EXISTING_BINDINGS_MESSAGE)
    expect(() => appendApiBinding('{', qualify)).toThrow(INVALID_EXISTING_BINDINGS_MESSAGE)
  })
})

describe('removeApiBinding', () => {
  it('drops the matching key and keeps the rest', () => {
    const existing = JSON.stringify([qualify, lookup])
    expect(JSON.parse(removeApiBinding(existing, 'qualify_lead'))).toEqual([lookup])
  })

  it('clears the field when the last binding is removed', () => {
    expect(removeApiBinding(JSON.stringify([qualify]), 'qualify_lead')).toBe('')
  })

  it('leaves other bindings when the key is unknown', () => {
    const existing = JSON.stringify([qualify])
    expect(JSON.parse(removeApiBinding(existing, 'missing'))).toEqual([qualify])
  })

  it('does not overwrite the textarea when existing JSON is invalid', () => {
    expect(() => removeApiBinding('not json', 'qualify_lead')).toThrow(
      INVALID_EXISTING_BINDINGS_MESSAGE
    )
  })
})

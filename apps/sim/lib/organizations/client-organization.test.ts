/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest'
import {
  clientSharedWorkspaceName,
  slugFromClientId,
} from '@/lib/organizations/client-organization'

describe('slugFromClientId', () => {
  it('prefixes a sanitized client id', () => {
    expect(slugFromClientId('Acme Corp')).toBe('client-acme-corp')
    expect(slugFromClientId('acme_123')).toBe('client-acme-123')
  })

  it('produces a valid slug for uuid-like ids', () => {
    expect(slugFromClientId('550e8400-e29b-41d4-a716-446655440000')).toBe(
      'client-550e8400-e29b-41d4-a716-446655440000'
    )
  })
})

describe('clientSharedWorkspaceName', () => {
  it('appends Workspace to the client name', () => {
    expect(clientSharedWorkspaceName('Acme')).toBe('Acme Workspace')
  })
})

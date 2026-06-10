import { createEnvMock } from '@sim/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CLIENT_STAKEHOLDER_USER_TYPE,
  getClientUserContext,
  getEmailDomainFromAddress,
  isClientUser,
} from './is-client-user'

vi.mock('../core/config/env', () =>
  createEnvMock({
    INTERNAL_USER_DOMAINS: 'position2.com',
  })
)

afterEach(() => {
  vi.clearAllMocks()
})

describe('getEmailDomainFromAddress', () => {
  it('returns lowercase domain for valid emails', () => {
    expect(getEmailDomainFromAddress('User@Client.COM')).toBe('client.com')
  })

  it('returns null for invalid input', () => {
    expect(getEmailDomainFromAddress('')).toBeNull()
    expect(getEmailDomainFromAddress('not-an-email')).toBeNull()
    expect(getEmailDomainFromAddress(undefined)).toBeNull()
  })
})

describe('isClientUser', () => {
  it('returns true when userType is client_stakeholder', () => {
    expect(
      isClientUser('internal@position2.com', {
        userType: CLIENT_STAKEHOLDER_USER_TYPE,
      })
    ).toBe(true)
  })

  it('returns false when userType is set to a non-client value', () => {
    expect(
      isClientUser('external@client.com', {
        userType: 'employee',
      })
    ).toBe(false)
  })

  it('returns false for null userType when userTypeOnly is true', () => {
    expect(
      isClientUser('external@client.com', {
        userType: null,
        userTypeOnly: true,
      })
    ).toBe(false)
  })

  it('uses internal domains when userType is absent', () => {
    expect(isClientUser('staff@position2.com')).toBe(false)
    expect(isClientUser('contact@acme.com')).toBe(true)
  })

  it('returns false when email domain cannot be parsed', () => {
    expect(isClientUser('invalid')).toBe(false)
  })
})

describe('getClientUserContext', () => {
  it('returns isClientUser and metadata for API payloads', () => {
    expect(
      getClientUserContext('pm@acme.com', {
        userType: CLIENT_STAKEHOLDER_USER_TYPE,
      })
    ).toEqual({
      isClientUser: true,
      userType: CLIENT_STAKEHOLDER_USER_TYPE,
      emailDomain: 'acme.com',
    })
  })
})

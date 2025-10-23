import { describe, expect, it } from 'vitest'
import { isEmailAllowed, validateEmailPatterns } from './email-validation'

describe('Email Validation', () => {
  describe('isEmailAllowed', () => {
    it('should allow exact email matches', () => {
      const allowedEmails = ['user@example.com', 'admin@company.com']

      expect(isEmailAllowed('user@example.com', allowedEmails)).toBe(true)
      expect(isEmailAllowed('admin@company.com', allowedEmails)).toBe(true)
      expect(isEmailAllowed('other@example.com', allowedEmails)).toBe(false)
    })

    it('should allow domain matches with @ prefix', () => {
      const allowedEmails = ['@example.com', '@company.com']

      expect(isEmailAllowed('user@example.com', allowedEmails)).toBe(true)
      expect(isEmailAllowed('admin@example.com', allowedEmails)).toBe(true)
      expect(isEmailAllowed('user@company.com', allowedEmails)).toBe(true)
      expect(isEmailAllowed('user@other.com', allowedEmails)).toBe(false)
    })

    it('should allow wildcard domain matches with *@ prefix', () => {
      const allowedEmails = ['*@position2.com', '*@example.com']

      expect(isEmailAllowed('anyone@position2.com', allowedEmails)).toBe(true)
      expect(isEmailAllowed('developer@position2.com', allowedEmails)).toBe(true)
      expect(isEmailAllowed('admin@position2.com', allowedEmails)).toBe(true)
      expect(isEmailAllowed('user@example.com', allowedEmails)).toBe(true)
      expect(isEmailAllowed('user@other.com', allowedEmails)).toBe(false)
    })

    it('should support mixed patterns', () => {
      const allowedEmails = [
        'specific@example.com', // Exact match
        '@company.com', // Domain match
        '*@position2.com', // Wildcard domain match
      ]

      // Exact match
      expect(isEmailAllowed('specific@example.com', allowedEmails)).toBe(true)
      expect(isEmailAllowed('other@example.com', allowedEmails)).toBe(false)

      // Domain match
      expect(isEmailAllowed('user@company.com', allowedEmails)).toBe(true)
      expect(isEmailAllowed('admin@company.com', allowedEmails)).toBe(true)

      // Wildcard domain match
      expect(isEmailAllowed('anyone@position2.com', allowedEmails)).toBe(true)
      expect(isEmailAllowed('developer@position2.com', allowedEmails)).toBe(true)

      // Unauthorized
      expect(isEmailAllowed('user@other.com', allowedEmails)).toBe(false)
    })

    it('should handle edge cases', () => {
      const allowedEmails = ['*@position2.com']

      // Invalid email format
      expect(isEmailAllowed('invalid-email', allowedEmails)).toBe(false)
      expect(isEmailAllowed('', allowedEmails)).toBe(false)

      // Empty allowed emails
      expect(isEmailAllowed('user@position2.com', [])).toBe(false)
      expect(isEmailAllowed('user@position2.com', null as any)).toBe(false)
      expect(isEmailAllowed('user@position2.com', undefined as any)).toBe(false)
    })
  })

  describe('validateEmailPatterns', () => {
    it('should validate exact email patterns', () => {
      const patterns = ['user@example.com', 'admin@company.com']
      const result = validateEmailPatterns(patterns)

      expect(result.isValid).toBe(true)
    })

    it('should validate domain patterns', () => {
      const patterns = ['@example.com', '@company.com']
      const result = validateEmailPatterns(patterns)

      expect(result.isValid).toBe(true)
    })

    it('should validate wildcard domain patterns', () => {
      const patterns = ['*@position2.com', '*@example.com']
      const result = validateEmailPatterns(patterns)

      expect(result.isValid).toBe(true)
    })

    it('should validate mixed patterns', () => {
      const patterns = ['specific@example.com', '@company.com', '*@position2.com']
      const result = validateEmailPatterns(patterns)

      expect(result.isValid).toBe(true)
    })

    it('should reject invalid patterns', () => {
      // Invalid wildcard pattern
      expect(validateEmailPatterns(['*@']).isValid).toBe(false)
      expect(validateEmailPatterns(['*@invalid']).isValid).toBe(false)

      // Invalid domain pattern
      expect(validateEmailPatterns(['@']).isValid).toBe(false)
      expect(validateEmailPatterns(['@invalid']).isValid).toBe(false)

      // Invalid email pattern
      expect(validateEmailPatterns(['invalid-email']).isValid).toBe(false)
      expect(validateEmailPatterns(['user@']).isValid).toBe(false)
      expect(validateEmailPatterns(['@user@example.com']).isValid).toBe(false)
    })

    it('should handle edge cases', () => {
      // Non-array input
      expect(validateEmailPatterns(null as any).isValid).toBe(false)
      expect(validateEmailPatterns(undefined as any).isValid).toBe(false)
      expect(validateEmailPatterns('string' as any).isValid).toBe(false)

      // Non-string elements
      expect(validateEmailPatterns([123 as any]).isValid).toBe(false)
      expect(validateEmailPatterns([null as any]).isValid).toBe(false)
    })
  })
})

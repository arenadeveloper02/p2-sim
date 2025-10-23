/**
 * Email validation utilities for chat access control
 * Supports exact email matches, domain matches, and wildcard domain matches
 */

/**
 * Validates if an email is allowed based on the allowedEmails list
 * Supports three patterns:
 * 1. Exact email match: "user@example.com"
 * 2. Domain match: "@example.com" (allows any email from that domain)
 * 3. Wildcard domain match: "*@example.com" (allows any email from that domain)
 *
 * @param email - The email to validate
 * @param allowedEmails - Array of allowed email patterns
 * @returns true if the email is allowed, false otherwise
 */
export function isEmailAllowed(email: string, allowedEmails: string[]): boolean {
  if (!email || !Array.isArray(allowedEmails)) {
    return false
  }

  // Check exact email matches
  if (allowedEmails.includes(email)) {
    return true
  }

  // Check domain and wildcard domain matches
  const emailDomain = email.split('@')[1]
  if (!emailDomain) {
    return false
  }

  return allowedEmails.some((allowed: string) => {
    // Domain match (prefixed with @)
    if (allowed.startsWith('@')) {
      return allowed === `@${emailDomain}`
    }

    // Wildcard domain match (prefixed with *@)
    if (allowed.startsWith('*@')) {
      const allowedDomain = allowed.substring(2) // Remove "*@" prefix
      return allowedDomain === emailDomain
    }

    return false
  })
}

/**
 * Validates email patterns in the allowedEmails array
 * Used for frontend validation to ensure proper format
 *
 * @param allowedEmails - Array of email patterns to validate
 * @returns Object with isValid boolean and error message if invalid
 */
export function validateEmailPatterns(allowedEmails: string[]): {
  isValid: boolean
  error?: string
} {
  if (!Array.isArray(allowedEmails)) {
    return { isValid: false, error: 'Allowed emails must be an array' }
  }

  for (const pattern of allowedEmails) {
    if (typeof pattern !== 'string') {
      return { isValid: false, error: 'All email patterns must be strings' }
    }

    // Check for valid patterns
    if (pattern.startsWith('*@')) {
      // Wildcard domain pattern: *@domain.com
      const domain = pattern.substring(2)
      if (!domain || !domain.includes('.')) {
        return { isValid: false, error: `Invalid wildcard domain pattern: ${pattern}` }
      }
    } else if (pattern.startsWith('@')) {
      // Domain pattern: @domain.com
      const domain = pattern.substring(1)
      if (!domain || !domain.includes('.')) {
        return { isValid: false, error: `Invalid domain pattern: ${pattern}` }
      }
    } else if (pattern.includes('@')) {
      // Exact email pattern: user@domain.com
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(pattern)) {
        return { isValid: false, error: `Invalid email format: ${pattern}` }
      }
    } else {
      return { isValid: false, error: `Invalid email pattern: ${pattern}` }
    }
  }

  return { isValid: true }
}

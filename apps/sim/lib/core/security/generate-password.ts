import { randomInt } from '@sim/utils/random'

/**
 * Generates a cryptographically secure random password.
 *
 * Lives apart from {@link encryptSecret} so client UI can generate passwords
 * without pulling `node:crypto` (AES-GCM) into the webpack browser graph.
 *
 * @param length - The length of the password (default: 24)
 */
export function generatePassword(length = 24): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_-+='
  let result = ''

  for (let i = 0; i < length; i++) {
    result += chars.charAt(randomInt(0, chars.length))
  }

  return result
}

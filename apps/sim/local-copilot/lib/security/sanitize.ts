import { isRecordLike } from '@sim/utils/object'

const SECRET_KEY_PATTERN =
  /(api[_-]?key|secret|password|token|refresh|access[_-]?token|private[_-]?key|authorization|credential)/i

const BEARER_PATTERN = /^Bearer\s+[A-Za-z0-9._-]+$/i

/**
 * Redacts known secret patterns from strings before sending to the LLM.
 */
export function redactSecrets(value: string): string {
  if (BEARER_PATTERN.test(value.trim())) return '[REDACTED_BEARER_TOKEN]'
  if (value.length > 20 && /^[A-Za-z0-9+/=_-]{20,}$/.test(value)) return '[REDACTED_SECRET]'
  return value
}

/**
 * Deep-sanitizes workflow and context objects, stripping secret-like values.
 */
export function sanitizeForLlm<T>(input: T): T {
  return sanitizeValue(input) as T
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return redactSecrets(value)
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item))
  }

  if (!isRecordLike(value)) {
    return value
  }

  const result: Record<string, unknown> = {}
  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      result[key] = '[REDACTED]'
      continue
    }
    result[key] = sanitizeValue(nested)
  }
  return result
}

/**
 * Validates that a patch payload does not contain raw secret values.
 */
export function patchContainsSecrets(patch: unknown): string[] {
  const violations: string[] = []
  scanForSecrets(patch, '', violations)
  return violations
}

function scanForSecrets(value: unknown, path: string, violations: string[]): void {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (BEARER_PATTERN.test(trimmed)) {
      violations.push(`${path || 'root'}: bearer token detected`)
    }
    if (trimmed.length >= 32 && /^sk-[A-Za-z0-9]+$/.test(trimmed)) {
      violations.push(`${path || 'root'}: API key pattern detected`)
    }
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForSecrets(item, `${path}[${index}]`, violations))
    return
  }

  if (!isRecordLike(value)) return

  for (const [key, nested] of Object.entries(value)) {
    const nextPath = path ? `${path}.${key}` : key
    if (SECRET_KEY_PATTERN.test(key) && typeof nested === 'string' && nested.length > 0) {
      violations.push(`${nextPath}: secret field must not contain values in patches`)
    }
    scanForSecrets(nested, nextPath, violations)
  }
}

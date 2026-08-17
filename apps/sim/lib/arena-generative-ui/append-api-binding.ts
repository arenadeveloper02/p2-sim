import { parseApiBindings } from '@/lib/arena-generative-ui/parse-inputs'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'

export const INVALID_EXISTING_BINDINGS_MESSAGE =
  'API Bindings is not valid JSON. Fix or clear the field, then save.'

/**
 * Appends a binding to existing API Bindings JSON, replacing any entry with the
 * same key. Pretty-prints the result for the code textarea.
 */
export function appendApiBinding(existingRaw: unknown, next: ArenaGenerativeApiBinding): string {
  let existing: ArenaGenerativeApiBinding[]
  try {
    existing = parseApiBindings(existingRaw)
  } catch {
    throw new Error(INVALID_EXISTING_BINDINGS_MESSAGE)
  }
  const withoutKey = existing.filter((binding) => binding.key !== next.key)
  return JSON.stringify([...withoutKey, next], null, 2)
}

import { parseApiBindings } from '@/lib/arena-generative-ui/parse-inputs'
import type { ArenaGenerativeApiBinding } from '@/lib/arena-generative-ui/types'

export const INVALID_EXISTING_BINDINGS_MESSAGE =
  'API Bindings is not valid JSON. Fix or clear the field, then save.'

function parseExistingBindings(existingRaw: unknown): ArenaGenerativeApiBinding[] {
  try {
    return parseApiBindings(existingRaw)
  } catch {
    throw new Error(INVALID_EXISTING_BINDINGS_MESSAGE)
  }
}

function serializeBindings(bindings: ArenaGenerativeApiBinding[]): string {
  if (bindings.length === 0) {
    return ''
  }
  return JSON.stringify(bindings, null, 2)
}

/**
 * Appends a binding to existing API Bindings JSON, replacing any entry with the
 * same key. Pretty-prints the result for the code textarea.
 */
export function appendApiBinding(existingRaw: unknown, next: ArenaGenerativeApiBinding): string {
  const withoutKey = parseExistingBindings(existingRaw).filter(
    (binding) => binding.key !== next.key
  )
  return serializeBindings([...withoutKey, next])
}

/**
 * Drops the binding with `key` from existing API Bindings JSON. An empty list
 * becomes a blank field so the editor matches the never-added state.
 */
export function removeApiBinding(existingRaw: unknown, key: string): string {
  return serializeBindings(
    parseExistingBindings(existingRaw).filter((binding) => binding.key !== key)
  )
}

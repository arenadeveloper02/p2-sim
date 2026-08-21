import type {
  ArenaGenerativeApiBinding,
  ArenaGenerativeInputSchemaField,
  ArenaGenerativeInputSource,
} from '@/lib/arena-generative-ui/types'

/**
 * Names that mean the signed-in user's address, not a typed lead/contact email.
 * Bare `email` / `e-mail` stay form fields — qualify-lead collects a prospect's
 * address under that name.
 */
const LOGGED_IN_EMAIL_FIELD_NAME =
  /^(user_?e-?mail|logged_?in_?e-?mail|actor_?e-?mail|visitor_?e-?mail|arena_?email_?id)$/i

export interface ArenaGenerativeInputSourceOverride {
  source: ArenaGenerativeInputSource
  value?: string
}

/**
 * Editor row for one start-block input: inferred source plus any user override.
 */
export interface ArenaGenerativeInputFieldEditorRow {
  name: string
  type: string
  description?: string
  source: ArenaGenerativeInputSource
  value: string
}

/**
 * True when a start-block field is the signed-in user's address rather than a
 * form control. Only actor-specific names (`userEmail`, `loggedInEmail`,
 * `visitorEmail`, `actorEmail`, `arenaEmailId`) qualify. A field named `email`
 * is a typed value (lead, contact, prospect) unless the author overrides it.
 */
export function inferInputFieldSource(name: string): ArenaGenerativeInputSource {
  if (LOGGED_IN_EMAIL_FIELD_NAME.test(name.trim())) {
    return 'visitorEmail'
  }
  return 'form'
}

/**
 * Drops default `form` source and leftover constant values so stored JSON stays
 * compact and round-trips through the allowlist parser.
 */
export function compactInputSchemaField(
  field: ArenaGenerativeInputSchemaField
): ArenaGenerativeInputSchemaField {
  const source = field.source && field.source !== 'form' ? field.source : undefined
  const next: ArenaGenerativeInputSchemaField = {
    name: field.name,
    type: field.type,
  }
  if (field.description?.trim()) {
    next.description = field.description.trim()
  }
  if (source) {
    next.source = source
  }
  if (source === 'constant' && field.value !== undefined) {
    next.value = field.value
  }
  return next
}

/**
 * Applies Add-an-API source/value overrides on top of inferred schema fields.
 */
export function applyInputSourceOverrides(
  fields: ArenaGenerativeInputSchemaField[],
  overrides: Record<string, ArenaGenerativeInputSourceOverride>
): ArenaGenerativeInputSchemaField[] {
  return fields.map((field) => {
    const override = overrides[field.name]
    if (!override) {
      return compactInputSchemaField(field)
    }
    return compactInputSchemaField({
      ...field,
      source: override.source,
      value: override.source === 'constant' ? override.value : undefined,
    })
  })
}

/**
 * Writes host-owned inputs onto the CTA payload. Form fields stay as submitted;
 * `visitorEmail` copies the resolved Arena email onto the start-block name;
 * `constant` stamps `value`. Applied on both sides of `inputMapping` so an
 * allowlist cannot drop keys the binding itself owns.
 */
export function applyBindingInputSources(
  values: Record<string, unknown>,
  binding: Pick<ArenaGenerativeApiBinding, 'inputSchema'>,
  arenaEmailId?: string
): Record<string, unknown> {
  const fields = binding.inputSchema
  if (!fields || fields.length === 0) {
    return values
  }
  const next = { ...values }
  const email = arenaEmailId?.trim()
  for (const field of fields) {
    if (field.source === 'visitorEmail') {
      if (email) {
        next[field.name] = email
      }
      continue
    }
    if (field.source === 'constant' && field.value !== undefined) {
      next[field.name] = field.value
    }
  }
  return next
}

/**
 * Resolves the source dropdown + constant box for one Add-an-API input row.
 */
export function resolveInputFieldEditorRow(
  field: ArenaGenerativeInputSchemaField,
  override?: ArenaGenerativeInputSourceOverride
): ArenaGenerativeInputFieldEditorRow {
  const source = override?.source ?? field.source ?? 'form'
  const value = source === 'constant' ? (override?.value ?? field.value ?? '') : (field.value ?? '')
  return {
    name: field.name,
    type: field.type,
    ...(field.description ? { description: field.description } : {}),
    source,
    value,
  }
}

/** True when a constant input is selected but has no value yet. */
export function inputFieldRowNeedsValue(row: ArenaGenerativeInputFieldEditorRow): boolean {
  return row.source === 'constant' && row.value.trim().length === 0
}

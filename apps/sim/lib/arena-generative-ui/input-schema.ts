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

/** API start-input names that take an address (`email`, `emailId`, or logged-in aliases). */
const EMAIL_LIKE_API_INPUT_NAME =
  /^(e-?mail|email_?id|user_?e-?mail|logged_?in_?e-?mail|actor_?e-?mail|visitor_?e-?mail|arena_?email_?id)$/i

const BRIEF_EMAIL_FIELD_NAME =
  /\b(userEmail|contactEmail|visitorEmail|loggedInEmail|actorEmail|user_?e-?mail|contact_?e-?mail|visitor_?e-?mail|logged_?in_?e-?mail)\b/i

const BRIEF_EMAIL_LIST_FIELD =
  /(?:^|\n)\s*[-*]\s+(?:(?:user|client|contact|visitor)\s+)?e-?mails?(?:\s+address)?\b/im

const BRIEF_EMAIL_TYPED_FIELD = /\be-?mails?(?:\s+address)?\b\s*\((?:text|email|string|input)\b/i

const BRIEF_EMAIL_NEAR_FIELD_WORD =
  /(?:\be-?mails?(?:\s+address)?\b[^\n]{0,40}\b(placeholder|field|input|label)\b|\b(placeholder|field|input|label)\b[^\n]{0,40}\be-?mails?(?:\s+address)?\b)/i

/**
 * True when a workflow/curl input is an address the host can fill (`email`,
 * `emailId`, `userEmail`, `arenaEmailId`). `contactEmail` stays a lead form
 * field and is not treated as emailId.
 */
export function isEmailLikeApiInputName(name: string): boolean {
  return EMAIL_LIKE_API_INPUT_NAME.test(name.trim())
}

/**
 * Conservative scan of User Input / Requested Changes for an email *form field*.
 * Empty brief and marketing copy ("we will email results") return false.
 */
export function briefHasEmailFormField(text: string): boolean {
  const brief = text.trim()
  if (!brief) return false
  return (
    BRIEF_EMAIL_FIELD_NAME.test(brief) ||
    BRIEF_EMAIL_LIST_FIELD.test(brief) ||
    BRIEF_EMAIL_TYPED_FIELD.test(brief) ||
    BRIEF_EMAIL_NEAR_FIELD_WORD.test(brief)
  )
}

/**
 * Save-time overrides for Add-an-API. When the brief has no email form field,
 * email-like API inputs are stamped `visitorEmail`. When it does, user
 * overrides (or name-inferred defaults) win.
 */
export function inputSourceOverridesForSave(
  fields: Array<{ name: string }>,
  brief: string,
  userOverrides: Record<string, ArenaGenerativeInputSourceOverride>
): Record<string, ArenaGenerativeInputSourceOverride> {
  if (briefHasEmailFormField(brief)) {
    return userOverrides
  }
  const next = { ...userOverrides }
  for (const field of fields) {
    if (!isEmailLikeApiInputName(field.name)) continue
    next[field.name] = { source: 'visitorEmail' }
  }
  return next
}

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

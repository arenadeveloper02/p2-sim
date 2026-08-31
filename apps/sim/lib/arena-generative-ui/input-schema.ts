import { chatProtocolReservedKeys } from '@/lib/arena-generative-ui/chat-protocol'
import { PAGINATION_ACTION_VALUE_KEYS } from '@/lib/arena-generative-ui/pagination'
import {
  ARENA_GENERATIVE_ACTOR_EMAIL_KEY,
  type ArenaGenerativeApiBinding,
  type ArenaGenerativeInputSchemaField,
  type ArenaGenerativeInputSource,
} from '@/lib/arena-generative-ui/types'
import { isFileFieldType } from '@/lib/workflows/input-format'
import { START_BLOCK_RESERVED_FIELDS } from '@/lib/workflows/types'

const RESERVED_START_INPUT_NAMES = new Set(
  START_BLOCK_RESERVED_FIELDS.map((name) => name.toLowerCase())
)

/** Sim `/execute` body flags. Not form controls — the host sets `stream` itself. */
const EXECUTE_PROTOCOL_INPUT_NAMES = new Set(['stream', 'includethinking', 'includetoolcalls'])

/**
 * Chat start-block protocol fields (`input`, `conversationId`, `files`). They are
 * not generative-app form controls. `input` may appear on the binding as an
 * optional first-message prefix; Chat and the host stamp the rest.
 */
export function isReservedStartInputName(name: string): boolean {
  return RESERVED_START_INPUT_NAMES.has(name.trim().toLowerCase())
}

/**
 * Start field `input` — optional prefix in Add-an-API, never a visitor control.
 */
export function isChatInputPrefixName(name: string): boolean {
  return name.trim().toLowerCase() === 'input'
}

/**
 * True when a start-block / curl field must not become a generative-app form
 * control: reserved chat names, Sim execute flags, or a `file[]` upload.
 */
export function isOmittedGenerativeInputField(
  field: { name: string; type?: string },
  value?: unknown
): boolean {
  if (isReservedStartInputName(field.name)) return true
  if (EXECUTE_PROTOCOL_INPUT_NAMES.has(field.name.trim().toLowerCase())) return true
  if (isFileFieldType(field.type)) return true
  return value !== undefined && isFileLikeInputValue(value)
}

/**
 * Curl JSON arrays of Sim file objects (`type: "file"`, or name + mime/data).
 * Ordinary object arrays (articles with `title`/`url`) stay form fields.
 */
function isFileLikeInputValue(value: unknown): boolean {
  if (!Array.isArray(value) || value.length === 0) return false
  const first = value.find((item) => item !== null && typeof item === 'object')
  if (!first || typeof first !== 'object' || Array.isArray(first)) return false
  const record = first as Record<string, unknown>
  if (record.type === 'file') return true
  return (
    typeof record.name === 'string' &&
    (typeof record.mime === 'string' || typeof record.data === 'string')
  )
}

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
  if (isChatInputPrefixName(name)) {
    return 'constant'
  }
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
/**
 * Workflow Start `input` is always an optional constant prefix, never form.
 */
export function lockChatInputPrefixSources(
  fields: ArenaGenerativeInputSchemaField[]
): ArenaGenerativeInputSchemaField[] {
  return fields.map((field) =>
    isChatInputPrefixName(field.name)
      ? compactInputSchemaField({ ...field, source: 'constant' })
      : compactInputSchemaField(field)
  )
}

export function applyInputSourceOverrides(
  fields: ArenaGenerativeInputSchemaField[],
  overrides: Record<string, ArenaGenerativeInputSourceOverride>
): ArenaGenerativeInputSchemaField[] {
  return fields.map((field) => {
    if (isChatInputPrefixName(field.name)) {
      const override = overrides[field.name]
      return compactInputSchemaField({
        ...field,
        source: 'constant',
        value: override?.source === 'constant' ? override.value : field.value,
      })
    }
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
    if (isChatInputPrefixName(field.name)) {
      continue
    }
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
 * Drops keys the binding did not declare. Bindings with no `inputSchema` keep
 * the submitted payload (Repeat row actions, schemaless forms). Pagination
 * params, `inputMapping` sources, and `arenaEmailId` stay.
 */
export function constrainBindingInput(
  values: Record<string, unknown>,
  binding: Pick<ArenaGenerativeApiBinding, 'inputSchema' | 'pagination' | 'chatProtocol'>,
  inputMapping?: Record<string, string>
): Record<string, unknown> {
  const fields = binding.inputSchema
  const chatKeys = chatProtocolReservedKeys(binding.chatProtocol)
  if ((!fields || fields.length === 0) && chatKeys.length === 0) {
    return values
  }
  const allowed = new Set<string>([
    ARENA_GENERATIVE_ACTOR_EMAIL_KEY,
    ...PAGINATION_ACTION_VALUE_KEYS,
    ...chatKeys,
  ])
  for (const field of fields ?? []) {
    const name = field.name.trim()
    if (name) allowed.add(name)
  }
  if (inputMapping) {
    for (const [target, source] of Object.entries(inputMapping)) {
      if (target.trim()) allowed.add(target.trim())
      if (source.trim()) allowed.add(source.trim())
    }
  }
  const pagination = binding.pagination
  if (pagination) {
    for (const key of [pagination.cursorParam, pagination.offsetParam, pagination.limitParam]) {
      if (key?.trim()) allowed.add(key.trim())
    }
  }
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(values)) {
    if (allowed.has(key)) next[key] = value
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
  if (isChatInputPrefixName(field.name)) {
    return {
      name: field.name,
      type: field.type,
      ...(field.description ? { description: field.description } : {}),
      source: 'constant',
      value: override?.value ?? field.value ?? '',
    }
  }
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
  if (isChatInputPrefixName(row.name)) return false
  return row.source === 'constant' && row.value.trim().length === 0
}

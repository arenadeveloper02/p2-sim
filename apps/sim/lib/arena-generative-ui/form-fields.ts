import { type RepeatItemScope, readScopedStatePath } from '@/lib/arena-generative-ui/types'

export const ARENA_GENERATIVE_FORM_FIELD_TYPES = [
  'TextInput',
  'TextArea',
  'Select',
  'Checkbox',
  'RadioGroup',
  'NumberInput',
  'DateInput',
  'MultiSelect',
  'Switch',
  'SearchField',
] as const

export type ArenaGenerativeFormFieldType = (typeof ARENA_GENERATIVE_FORM_FIELD_TYPES)[number]

const FORM_FIELD_TYPE_SET = new Set<string>(ARENA_GENERATIVE_FORM_FIELD_TYPES)

interface SpecElement {
  type?: string
  props?: Record<string, unknown>
  children?: string[]
}

export interface ArenaGenerativeFormField {
  type: ArenaGenerativeFormFieldType
  props: Record<string, unknown>
}

export interface ShowWhenClause {
  name: string
  op: 'truthy' | 'falsy' | 'eq' | 'neq'
  value?: string
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asBoolean(value: unknown): boolean {
  return value === true
}

function asFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export function isFormFieldType(type: string | undefined): type is ArenaGenerativeFormFieldType {
  return Boolean(type && FORM_FIELD_TYPE_SET.has(type))
}

/**
 * Walks a Form's descendants and returns catalog field elements in document order.
 */
export function listFormFields(
  elements: Record<string, SpecElement>,
  childIds: string[]
): ArenaGenerativeFormField[] {
  const fields: ArenaGenerativeFormField[] = []
  const walk = (ids: string[]) => {
    for (const id of ids) {
      const element = elements[id]
      if (!element) continue
      if (isFormFieldType(element.type)) {
        fields.push({ type: element.type, props: element.props ?? {} })
      }
      walk(element.children ?? [])
    }
  }
  walk(childIds)
  return fields
}

export function parseOptionList(raw: unknown): string[] {
  return asString(raw)
    .split(',')
    .map((option) => option.trim())
    .filter(Boolean)
}

/**
 * `showWhen` is comma-separated AND clauses: `notify`, `!selectedId`,
 * `channel=email`, `channel!=sms`.
 */
export function parseShowWhen(raw: unknown): ShowWhenClause[] {
  return asString(raw)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (part.startsWith('!')) {
        const name = part.slice(1).trim()
        if (name && !name.includes('=') && !name.includes('!')) {
          return { name, op: 'falsy' as const }
        }
      }
      const neqIndex = part.indexOf('!=')
      if (neqIndex > 0) {
        return {
          name: part.slice(0, neqIndex).trim(),
          op: 'neq' as const,
          value: part.slice(neqIndex + 2).trim(),
        }
      }
      const eqIndex = part.indexOf('=')
      if (eqIndex > 0) {
        return {
          name: part.slice(0, eqIndex).trim(),
          op: 'eq' as const,
          value: part.slice(eqIndex + 1).trim(),
        }
      }
      return { name: part, op: 'truthy' as const }
    })
    .filter((clause) => clause.name.length > 0)
}

export function isTruthyFieldValue(value: unknown): boolean {
  if (value === true || value === 1) return true
  if (value === false || value === 0 || value == null) return false
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase()
    return trimmed.length > 0 && trimmed !== 'false' && trimmed !== '0'
  }
  return true
}

function clauseMatches(clause: ShowWhenClause, values: Record<string, unknown>): boolean {
  const actual = values[clause.name]
  if (clause.op === 'truthy') return isTruthyFieldValue(actual)
  if (clause.op === 'falsy') return !isTruthyFieldValue(actual)
  const actualText = Array.isArray(actual)
    ? actual.map((item) => String(item)).join(',')
    : String(actual ?? '')
  const expected = clause.value ?? ''
  if (clause.op === 'eq') return actualText === expected
  return actualText !== expected
}

export function fieldIsVisible(
  props: Record<string, unknown>,
  values: Record<string, unknown>
): boolean {
  const clauses = parseShowWhen(props.showWhen)
  if (clauses.length === 0) return true
  return clauses.every((clause) => clauseMatches(clause, values))
}

function parseDefaultChecked(props: Record<string, unknown>): boolean {
  if (typeof props.defaultChecked === 'boolean') return props.defaultChecked
  const raw = asString(props.defaultValue).trim().toLowerCase()
  return raw === 'true' || raw === '1' || raw === 'on' || raw === 'yes'
}

function parseDefaultList(props: Record<string, unknown>): string[] {
  return parseOptionList(props.defaultValue)
}

/**
 * Current value for a field: user edits win, then `statePath`, then defaultValue / defaultChecked.
 */
export function resolveFieldValue(
  type: ArenaGenerativeFormFieldType,
  props: Record<string, unknown>,
  formValues: Record<string, unknown>,
  state: Record<string, unknown>,
  scope?: RepeatItemScope
): unknown {
  const name = asString(props.name)
  if (name && Object.hasOwn(formValues, name)) {
    return formValues[name]
  }
  const statePath = asString(props.statePath)
  if (statePath) {
    const fromState = readScopedStatePath(state, statePath, scope)
    if (fromState !== undefined && fromState !== null) {
      return fromState
    }
  }
  if (type === 'Checkbox' || type === 'Switch') {
    return parseDefaultChecked(props)
  }
  if (type === 'MultiSelect') {
    return parseDefaultList(props)
  }
  return asString(props.defaultValue)
}

export function snapshotFormValues(
  fields: ArenaGenerativeFormField[],
  formValues: Record<string, unknown>,
  state: Record<string, unknown>,
  scope?: RepeatItemScope
): Record<string, unknown> {
  const snapshot: Record<string, unknown> = { ...formValues }
  for (const field of fields) {
    const name = asString(field.props.name)
    if (!name || Object.hasOwn(snapshot, name)) continue
    snapshot[name] = resolveFieldValue(field.type, field.props, formValues, state, scope)
  }
  return snapshot
}

export function isEmptyFieldValue(type: ArenaGenerativeFormFieldType, value: unknown): boolean {
  if (type === 'Checkbox' || type === 'Switch') {
    return !isTruthyFieldValue(value)
  }
  if (type === 'MultiSelect') {
    return !Array.isArray(value) || value.length === 0
  }
  if (value == null) return true
  return String(value).trim().length === 0
}

function fieldLabel(props: Record<string, unknown>): string {
  return asString(props.label) || asString(props.name) || 'This field'
}

function invalidMessage(props: Record<string, unknown>, fallback: string): string {
  return asString(props.errorText) || fallback
}

function coerceSubmitValue(type: ArenaGenerativeFormFieldType, value: unknown): unknown {
  if (type === 'Checkbox' || type === 'Switch') {
    return isTruthyFieldValue(value)
  }
  if (type === 'MultiSelect') {
    if (Array.isArray(value)) return value.map((item) => String(item))
    return parseOptionList(value)
  }
  if (type === 'NumberInput') {
    const number = asFiniteNumber(value)
    return number === undefined ? '' : number
  }
  return value == null ? '' : String(value)
}

/**
 * Visible fields only. Hidden `showWhen` fields are omitted from the action payload.
 */
export function collectVisibleFieldValues(
  fields: ArenaGenerativeFormField[],
  formValues: Record<string, unknown>,
  state: Record<string, unknown>,
  scope?: RepeatItemScope
): Record<string, unknown> {
  const snapshot = snapshotFormValues(fields, formValues, state, scope)
  const values: Record<string, unknown> = {}
  for (const field of fields) {
    const name = asString(field.props.name)
    if (!name || !fieldIsVisible(field.props, snapshot)) continue
    values[name] = coerceSubmitValue(field.type, snapshot[name])
  }
  return values
}

/**
 * Returns `{ [name]: message }` for visible fields that fail required / numeric bounds.
 */
export function validateVisibleFields(
  fields: ArenaGenerativeFormField[],
  formValues: Record<string, unknown>,
  state: Record<string, unknown>,
  scope?: RepeatItemScope
): Record<string, string> {
  const snapshot = snapshotFormValues(fields, formValues, state, scope)
  const errors: Record<string, string> = {}
  for (const field of fields) {
    const name = asString(field.props.name)
    if (!name || !fieldIsVisible(field.props, snapshot)) continue
    const value = snapshot[name]
    const label = fieldLabel(field.props)
    if (asBoolean(field.props.required) && isEmptyFieldValue(field.type, value)) {
      errors[name] = invalidMessage(field.props, `${label} is required`)
      continue
    }
    if (field.type !== 'NumberInput' || isEmptyFieldValue(field.type, value)) continue
    const number = asFiniteNumber(value)
    if (number === undefined) {
      errors[name] = invalidMessage(field.props, `${label} must be a number`)
      continue
    }
    const min = asFiniteNumber(field.props.min)
    const max = asFiniteNumber(field.props.max)
    if (min !== undefined && number < min) {
      errors[name] = invalidMessage(field.props, `${label} must be at least ${min}`)
    } else if (max !== undefined && number > max) {
      errors[name] = invalidMessage(field.props, `${label} must be at most ${max}`)
    }
  }
  return errors
}

export function asFieldString(value: unknown): string {
  if (value == null) return ''
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ')
  return String(value)
}

export function asFieldStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item))
  return parseOptionList(value)
}

/**
 * Values present in the live form DOM. Tests (and native fill) often set
 * `input.value` without going through React onChange; FormData still sees them.
 */
export function valuesFromFormElement(form: HTMLFormElement): Record<string, unknown> {
  const data = new FormData(form)
  const values: Record<string, unknown> = {}
  for (const key of new Set(data.keys())) {
    const all = data.getAll(key).filter((item): item is string => typeof item === 'string')
    if (all.length > 1) {
      values[key] = all
    } else {
      values[key] = all[0] ?? ''
    }
  }
  return values
}

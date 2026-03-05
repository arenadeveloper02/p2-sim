import type { InputFormatField } from '@/lib/workflows/types'
import { START_BLOCK_RESERVED_FIELDS } from '@/lib/workflows/types'

/**
 * Normalizes an input format value into a list of valid fields.
 *
 * Filters out:
 * - null or undefined values
 * - Empty arrays
 * - Non-array values
 * - Fields without names
 * - Fields with empty or whitespace-only names
 *
 * @param inputFormatValue - Raw input format value from subblock state
 * @returns Array of validated input format fields
 */
export function normalizeInputFormatValue(inputFormatValue: unknown): InputFormatField[] {
  // Handle null, undefined, and empty arrays
  if (
    inputFormatValue === null ||
    inputFormatValue === undefined ||
    (Array.isArray(inputFormatValue) && inputFormatValue.length === 0)
  ) {
    return []
  }

  // Handle non-array values
  if (!Array.isArray(inputFormatValue)) {
    return []
  }

  // Filter valid fields
  return inputFormatValue.filter(
    (field): field is InputFormatField =>
      field &&
      typeof field === 'object' &&
      typeof field.name === 'string' &&
      field.name.trim() !== ''
  )
}

/**
 * Filters custom fields from inputFormat, excluding reserved fields.
 * Reserved fields are: 'input', 'conversationId', 'files'
 *
 * This function provides a consistent way to identify custom (user-defined) input fields
 * that should trigger features like the Re-run button and input modal.
 *
 * @param inputFormat - Input format array from Start Block configuration
 * @returns Array of custom fields (excluding reserved fields)
 */
export function getCustomInputFields(
  inputFormat: InputFormatField[] | null | undefined
): InputFormatField[] {
  if (!inputFormat) return []

  const normalizedFields = normalizeInputFormatValue(inputFormat)

  // Create a set of reserved field names in lowercase for case-insensitive comparison
  const reservedFieldsLower = new Set(
    START_BLOCK_RESERVED_FIELDS.map((field) => field.toLowerCase())
  )

  return normalizedFields.filter((field) => {
    const fieldName = field.name?.trim().toLowerCase()
    if (!fieldName) return false
    // Check if field is in reserved fields set (case-insensitive)
    return !reservedFieldsLower.has(fieldName)
  })
}

/**
 * Fixed-input-set field with its options array for dropdown UI.
 */
export interface FixedInputSetField {
  name: string
  options: string[]
}

/**
 * Splits a string by comma or newline and trims each part for use as separate options.
 */
function splitOptionString(s: string): string[] {
  return s
    .split(/[,\n]/)
    .map((part) => part.trim())
    .filter(Boolean)
}

/**
 * Normalizes a parsed array into option strings; if the array has one string that
 * contains commas/newlines, splits it into multiple options.
 */
function normalizeOptionsArray(arr: unknown[]): string[] {
  const mapped = arr.map((v) => (v != null ? String(v).trim() : '')).filter(Boolean)
  if (mapped.length === 1 && mapped[0]!.includes(',')) {
    return splitOptionString(mapped[0])
  }
  if (mapped.length === 1 && mapped[0]!.includes('\n')) {
    return splitOptionString(mapped[0])
  }
  return mapped
}

/**
 * Parses the value of a fixed-input-set field into an array of option strings.
 * The value may be stored as a JSON array string (from the editor), an actual array,
 * or a single comma/newline-separated string.
 */
export function parseFixedInputSetValue(raw: unknown): string[] {
  if (Array.isArray(raw) && raw.length > 0) {
    return normalizeOptionsArray(raw)
  }
  if (typeof raw === 'string' && raw.trim() !== '') {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed) && parsed.length > 0) {
        return normalizeOptionsArray(parsed)
      }
    } catch {
      // Not valid JSON; treat as comma/newline-separated list
      return splitOptionString(raw)
    }
  }
  return []
}

/**
 * Extracts fields of type 'fixed-input-set' that have a non-empty set of options.
 * Used by the workspace chat to show a dropdown for run-time selection.
 * Options come from the Start Block's field.value (array or JSON array string).
 *
 * @param inputFormat - Input format array from Start Block configuration
 * @returns Array of fixed-input-set fields with their option arrays
 */
export function getFixedInputSetFields(
  inputFormat: InputFormatField[] | null | undefined
): FixedInputSetField[] {
  const normalized = normalizeInputFormatValue(inputFormat)
  const result: FixedInputSetField[] = []
  for (const field of normalized) {
    if (field.type !== 'fixed-input-set') continue
    const name = field.name?.trim()
    if (!name) continue
    const options = parseFixedInputSetValue(field.value)
    if (options.length > 0) {
      result.push({ name, options })
    }
  }
  return result
}

/**
 * Returns the first option for a fixed-input-set field (for default/fallback value).
 */
export function getFirstFixedInputSetOption(field: InputFormatField): string {
  const options = parseFixedInputSetValue(field.value)
  return options[0] ?? ''
}

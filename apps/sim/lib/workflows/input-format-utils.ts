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

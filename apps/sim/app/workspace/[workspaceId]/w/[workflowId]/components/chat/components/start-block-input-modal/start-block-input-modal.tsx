'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Input, Label, Modal, ModalContent, ModalFooter, ModalHeader } from '@/components/emcn'
import { createLogger } from '@/lib/logs/console/logger'
import { normalizeInputFormatValue } from '@/lib/workflows/input-format-utils'
import { START_BLOCK_RESERVED_FIELDS, type InputFormatField } from '@/lib/workflows/types'

const logger = createLogger('StartBlockInputModal')

/**
 * Props for StartBlockInputModal component
 */
export interface StartBlockInputModalProps {
  /**
   * Whether the modal is open
   */
  open: boolean
  /**
   * Callback when modal open state changes
   */
  onOpenChange: (open: boolean) => void
  /**
   * Input format fields from Start Block
   */
  inputFormat: InputFormatField[] | null | undefined
  /**
   * Callback when user submits the form
   * @param values - Object mapping field names to their values
   */
  onSubmit: (values: Record<string, unknown>) => void
  /**
   * Initial values to populate the form (optional)
   */
  initialValues?: Record<string, unknown>
}

/**
 * Modal component for collecting Start Block input values
 *
 * Dynamically renders input fields based on Start Block inputFormat,
 * excluding reserved fields (input, conversationId, files) which are
 * handled separately.
 */
export function StartBlockInputModal({
  open,
  onOpenChange,
  inputFormat,
  onSubmit,
  initialValues = {},
}: StartBlockInputModalProps) {
  const normalizedFields = normalizeInputFormatValue(inputFormat)
  
  // Filter out reserved fields - these are handled separately (memoized to prevent recalculation)
  const customFields = useMemo(
    () =>
      normalizedFields.filter(
        (field) => {
          const fieldName = field.name?.trim().toLowerCase()
          return fieldName && !START_BLOCK_RESERVED_FIELDS.includes(fieldName as any)
        }
      ),
    [normalizedFields]
  )

  /**
   * Safely normalizes a value to a string for form inputs
   * Handles browser autofill values that might be objects/arrays
   * Always returns a string to prevent React from accessing .length on undefined
   */
  const normalizeValueForInput = useCallback((value: unknown, fieldType?: string): string => {
    try {
      // Handle null/undefined first
      if (value === null || value === undefined) {
        return ''
      }
      
      // Handle objects (browser autofill can sometimes set objects)
      if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
        logger.warn('normalizeValueForInput: received object, converting to string', { value, fieldType })
        // Try to extract a meaningful string, or use JSON.stringify as fallback
        if ('value' in value && typeof value.value === 'string') {
          return value.value
        }
        if ('toString' in value && typeof value.toString === 'function') {
          return value.toString()
        }
        return JSON.stringify(value)
      }
      
      // Handle arrays
      if (Array.isArray(value)) {
        return value.length > 0 ? String(value[0]) : ''
      }
      
      // For non-string types, preserve the value but ensure string representation for display
      if (fieldType === 'number') {
        return typeof value === 'number' ? String(value) : value === '' ? '' : String(value)
      }
      
      if (fieldType === 'boolean') {
        return value === true || value === 'true' ? 'true' : 'false'
      }
      
      if (fieldType === 'object' || fieldType === 'array') {
        return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
      }
      
      // For string fields, ensure it's always a string
      return typeof value === 'string' ? value : String(value)
    } catch (error) {
      logger.error('Error in normalizeValueForInput', { value, fieldType, error })
      // Always return a string, even on error
      return ''
    }
  }, [])

  // Initialize form state with initial values or empty strings
  const [formValues, setFormValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {}
    for (const field of customFields) {
      const fieldName = field.name?.trim()
      if (fieldName) {
        const initialValue = initialValues[fieldName]
        // Safely normalize initial value
        initial[fieldName] = initialValue === null || initialValue === undefined ? '' : initialValue
      }
    }
    return initial
  })

  // Reset form when modal opens (only when opening, not on every change)
  useEffect(() => {
    if (open) {
      const newValues: Record<string, unknown> = {}
      for (const field of customFields) {
        const fieldName = field.name?.trim()
        if (fieldName) {
          const initialValue = initialValues[fieldName]
          // Safely normalize initial value
          newValues[fieldName] = initialValue === null || initialValue === undefined ? '' : initialValue
        }
      }
      setFormValues(newValues)
    }
    // Only reset when modal opens, not when initialValues change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /**
   * Handles input field changes
   * Safely handles undefined/null/object values to prevent errors
   * Browser autofill can sometimes set values as objects or arrays
   */
  const handleFieldChange = useCallback((fieldName: string, value: unknown) => {
    // Normalize undefined/null to empty string
    let normalizedValue: unknown = value
    
    if (value === undefined || value === null) {
      normalizedValue = ''
    } else if (typeof value === 'object' && !Array.isArray(value) && value !== null) {
      // If browser autofill sets an object, try to extract a string value
      // This can happen with some browser autofill implementations
      logger.warn('Received object value from input, normalizing to string', { fieldName, value })
      normalizedValue = String(value)
    } else if (Array.isArray(value)) {
      // If it's an array, convert to string
      normalizedValue = value.length > 0 ? String(value[0]) : ''
    }
    
    setFormValues((prev) => ({
      ...prev,
      [fieldName]: normalizedValue,
    }))
  }, [])

  /**
   * Handles form submission
   */
  const handleSubmit = useCallback(() => {
    // Ensure all fields are present (empty string if not provided)
    const finalValues: Record<string, unknown> = {}
    for (const field of customFields) {
      const fieldName = field.name?.trim()
      if (fieldName) {
        finalValues[fieldName] = formValues[fieldName] ?? ''
      }
    }
    
    onSubmit(finalValues)
    onOpenChange(false)
  }, [customFields, formValues, onSubmit, onOpenChange])

  /**
   * Formats field names by replacing underscores with spaces
   */
  const formatFieldName = useCallback((name: string): string => {
    return name.replace(/_/g, ' ')
  }, [])

  /**
   * Handles modal close
   */
  const handleClose = useCallback(() => {
    onOpenChange(false)
  }, [onOpenChange])

  // Don't render if no custom fields
  if (customFields.length === 0) {
    return null
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange}>
      <ModalContent className="max-w-[500px]" showClose={true}>
        <ModalHeader>Workflow Inputs</ModalHeader>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto px-4 py-2">
          {customFields.map((field) => {
            const fieldName = field.name?.trim()
            if (!fieldName) return null

            const fieldType = field.type || 'string'
            const displayName = formatFieldName(fieldName)
            // Safely get value, ensuring it's never undefined/null/object
            // Browser autofill can sometimes set values as objects or other unexpected types
            const rawValue = formValues[fieldName]
            let value: unknown = rawValue
            
            // Defensive normalization - ensure value is always a safe type
            if (value === undefined || value === null) {
              value = ''
            } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
              // Browser autofill might set an object - convert to string safely
              logger.warn('Detected object value in form field, normalizing', { fieldName, value })
              value = String(value)
            } else if (Array.isArray(value)) {
              // If it's an array, take the first element or empty string
              value = value.length > 0 ? value[0] : ''
            }

            return (
              <div key={fieldName} className="flex flex-col gap-2">
                <Label htmlFor={fieldName} className="font-medium text-[12px]">
                  {displayName}
                  {fieldType !== 'string' && (
                    <span className="ml-1 font-normal text-[var(--text-tertiary)]">
                      ({fieldType})
                    </span>
                  )}
                </Label>
                {fieldType === 'boolean' ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id={fieldName}
                      checked={value === true || value === 'true'}
                      onChange={(e) => handleFieldChange(fieldName, e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--border)]"
                    />
                    <label htmlFor={fieldName} className="text-[12px]">
                      {value === true || value === 'true' ? 'Yes' : 'No'}
                    </label>
                  </div>
                ) : fieldType === 'number' ? (
                  <Input
                    id={fieldName}
                    type="number"
                    value={
                      typeof value === 'number'
                        ? value
                        : value === '' || value === null || value === undefined
                        ? ''
                        : typeof value === 'string' && value.trim() === ''
                        ? ''
                        : Number(value) || ''
                    }
                    onChange={(e) => {
                      const inputValue = e.target.value
                      if (inputValue === '') {
                        handleFieldChange(fieldName, '')
                      } else {
                        const numValue = Number(inputValue)
                        handleFieldChange(
                          fieldName,
                          Number.isNaN(numValue) ? (typeof value === 'number' ? value : '') : numValue
                        )
                      }
                    }}
                    onBlur={(e) => {
                      // Additional safety check on blur
                      const inputValue = e.target.value
                      const currentValue = formValues[fieldName]
                      // Normalize if needed
                      if (inputValue === '') {
                        handleFieldChange(fieldName, '')
                      } else if (typeof currentValue !== 'number' && typeof currentValue !== 'string') {
                        const numValue = Number(inputValue)
                        handleFieldChange(fieldName, Number.isNaN(numValue) ? '' : numValue)
                      }
                    }}
                    placeholder={`Enter ${displayName}`}
                    className="text-[12px]"
                  />
                ) : fieldType === 'object' || fieldType === 'array' ? (
                  <textarea
                    id={fieldName}
                    value={
                      typeof value === 'string'
                        ? value
                        : value === null || value === undefined
                        ? ''
                        : JSON.stringify(value, null, 2)
                    }
                    onChange={(e) => {
                      const inputValue = e.target.value
                      if (inputValue === '') {
                        handleFieldChange(fieldName, '')
                      } else {
                        try {
                          const parsed = JSON.parse(inputValue)
                          handleFieldChange(fieldName, parsed)
                        } catch {
                          handleFieldChange(fieldName, inputValue)
                        }
                      }
                    }}
                    placeholder={`Enter ${displayName} as JSON`}
                    className="min-h-[80px] w-full rounded-[4px] border border-[var(--border)] bg-[var(--surface-9)] px-2 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                  />
                ) : (
                  <Input
                    id={fieldName}
                    type="text"
                    value={(() => {
                      try {
                        return normalizeValueForInput(value, fieldType)
                      } catch (error) {
                        logger.error('Error normalizing value for input', { fieldName, value, error })
                        return ''
                      }
                    })()}
                    onChange={(e) => {
                      try {
                        const inputValue = e.target.value
                        // Always pass the string value directly
                        handleFieldChange(fieldName, inputValue)
                      } catch (error) {
                        logger.error('Error handling input change', { fieldName, error })
                        // Fallback: set to empty string
                        handleFieldChange(fieldName, '')
                      }
                    }}
                    onBlur={(e) => {
                      try {
                        // Additional safety check on blur - normalize the value again
                        const inputValue = e.target.value || ''
                        const currentValue = formValues[fieldName]
                        // If the value changed or is invalid, normalize it
                        if (typeof currentValue !== 'string' || currentValue !== inputValue) {
                          handleFieldChange(fieldName, inputValue)
                        }
                      } catch (error) {
                        logger.error('Error handling input blur', { fieldName, error })
                      }
                    }}
                    placeholder={`Enter ${displayName}`}
                    className="text-[12px]"
                  />
                )}
              </div>
            )
          })}
        </div>

        <ModalFooter>
          <Button variant="ghost" onClick={handleClose} className="text-[12px]">
            Close
          </Button>
          <Button onClick={handleSubmit} className="text-[12px]">
            Submit
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  )
}


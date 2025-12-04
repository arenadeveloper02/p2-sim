'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Button, Input, Label, Modal, ModalContent, ModalHeader, ModalTitle, ModalFooter } from '@/components/emcn'
import { normalizeInputFormatValue } from '@/lib/workflows/input-format-utils'
import type { InputFormatField } from '@/lib/workflows/types'
import { START_BLOCK_RESERVED_FIELDS } from '@/lib/workflows/types'
import { createLogger } from '@/lib/logs/console/logger'

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

  // Initialize form state with initial values or empty strings
  const [formValues, setFormValues] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {}
    for (const field of customFields) {
      const fieldName = field.name?.trim()
      if (fieldName) {
        initial[fieldName] = initialValues[fieldName] ?? ''
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
          newValues[fieldName] = initialValues[fieldName] ?? ''
        }
      }
      setFormValues(newValues)
    }
    // Only reset when modal opens, not when initialValues change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /**
   * Handles input field changes
   */
  const handleFieldChange = useCallback((fieldName: string, value: unknown) => {
    setFormValues((prev) => ({
      ...prev,
      [fieldName]: value,
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
        <ModalHeader>
          <ModalTitle>Workflow Inputs</ModalTitle>
        </ModalHeader>

        <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto">
          {customFields.map((field) => {
            const fieldName = field.name?.trim()
            if (!fieldName) return null

            const fieldType = field.type || 'string'
            const value = formValues[fieldName] ?? ''

            return (
              <div key={fieldName} className="flex flex-col gap-2">
                <Label htmlFor={fieldName} className="font-medium text-[12px]">
                  {fieldName}
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
                    value={typeof value === 'number' ? value : value === '' ? '' : Number(value) || ''}
                    onChange={(e) => {
                      const numValue = e.target.value === '' ? '' : Number(e.target.value)
                      handleFieldChange(fieldName, numValue === '' ? '' : Number.isNaN(numValue) ? value : numValue)
                    }}
                    placeholder={`Enter ${fieldName}`}
                    className="text-[12px]"
                  />
                ) : fieldType === 'object' || fieldType === 'array' ? (
                  <textarea
                    id={fieldName}
                    value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                    onChange={(e) => {
                      try {
                        const parsed = JSON.parse(e.target.value)
                        handleFieldChange(fieldName, parsed)
                      } catch {
                        handleFieldChange(fieldName, e.target.value)
                      }
                    }}
                    placeholder={`Enter ${fieldName} as JSON`}
                    className="min-h-[80px] w-full rounded-[4px] border border-[var(--border)] bg-[var(--surface-9)] px-2 py-1.5 text-[12px] focus:outline-none focus:ring-1 focus:ring-[var(--brand-primary)]"
                  />
                ) : (
                  <Input
                    id={fieldName}
                    type="text"
                    value={typeof value === 'string' ? value : String(value ?? '')}
                    onChange={(e) => handleFieldChange(fieldName, e.target.value)}
                    placeholder={`Enter ${fieldName}`}
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


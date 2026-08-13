import { useEffect, useRef, useState } from 'react'
import { requestJson } from '@/lib/api/client/request'
import { validateGenerativeAppIdentifierContract } from '@/lib/api/contracts/arena-generative-apps'
import { isReservedGenerativeAppIdentifier } from '@/lib/arena-generative-ui/types'

const IDENTIFIER_PATTERN = /^[a-z0-9-]+$/
const DEBOUNCE_MS = 500

interface IdentifierValidationState {
  isChecking: boolean
  error: string | null
  isValid: boolean
}

/**
 * Validates generative-app identifier availability with a debounced API check.
 */
export function useGenerativeAppIdentifierValidation(
  identifier: string,
  originalIdentifier?: string,
  isEditingExisting?: boolean
): IdentifierValidationState {
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isValid, setIsValid] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    setError(null)
    setIsValid(false)
    setIsChecking(false)

    if (!identifier.trim()) {
      return
    }

    if (originalIdentifier && identifier === originalIdentifier) {
      setIsValid(true)
      return
    }

    if (isEditingExisting && !originalIdentifier) {
      setIsValid(true)
      return
    }

    if (!IDENTIFIER_PATTERN.test(identifier)) {
      setError('Identifier can only contain lowercase letters, numbers, and hyphens')
      return
    }

    if (isReservedGenerativeAppIdentifier(identifier)) {
      setError('This identifier is reserved')
      return
    }

    setIsChecking(true)
    timeoutRef.current = setTimeout(async () => {
      try {
        const data = await requestJson(validateGenerativeAppIdentifierContract, {
          query: { identifier },
        })
        if (!data.available) {
          setError(data.error || 'This identifier is already in use')
          setIsValid(false)
        } else {
          setError(null)
          setIsValid(true)
        }
      } catch {
        setError('Error checking identifier availability')
        setIsValid(false)
      } finally {
        setIsChecking(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [identifier, originalIdentifier, isEditingExisting])

  return { isChecking, error, isValid }
}

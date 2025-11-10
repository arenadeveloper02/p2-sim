/**
 * Safe storage adapter for zustand persist middleware
 * Handles cases where localStorage might be unavailable (SSR, disabled storage, quota exceeded, etc.)
 */

import { createJSONStorage } from 'zustand/middleware'

/**
 * Checks if localStorage is available and accessible
 */
function isLocalStorageAvailable(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  try {
    const testKey = '__storage_test__'
    localStorage.setItem(testKey, 'test')
    localStorage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

/**
 * Creates a safe storage adapter that gracefully handles unavailable storage
 * Falls back to a no-op storage if localStorage is not available
 */
export function createSafeStorage() {
  const available = isLocalStorageAvailable()

  if (!available) {
    // Return a no-op storage adapter that silently fails
    const noOpStorage = {
      getItem: () => null,
      setItem: () => {
        // Silently fail - storage is unavailable
      },
      removeItem: () => {
        // Silently fail - storage is unavailable
      },
    }
    return createJSONStorage(() => noOpStorage)
  }

  // Create a safe wrapper around localStorage that handles errors
  const safeLocalStorage = {
    getItem: (name: string): string | null => {
      try {
        return localStorage.getItem(name)
      } catch (error) {
        // Log error in development, but don't throw
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[zustand persist] Failed to get item '${name}' from localStorage:`, error)
        }
        return null
      }
    },
    setItem: (name: string, value: string): void => {
      try {
        localStorage.setItem(name, value)
      } catch (error) {
        // Log error in development, but don't throw
        // Common causes: quota exceeded, storage disabled, etc.
        if (process.env.NODE_ENV === 'development') {
          console.warn(`[zustand persist] Failed to set item '${name}' in localStorage:`, error)
        }
        // Silently fail - the app should continue to work without persistence
      }
    },
    removeItem: (name: string): void => {
      try {
        localStorage.removeItem(name)
      } catch (error) {
        // Log error in development, but don't throw
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            `[zustand persist] Failed to remove item '${name}' from localStorage:`,
            error
          )
        }
      }
    },
  }

  return createJSONStorage(() => safeLocalStorage)
}

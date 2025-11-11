/**
 * Safe storage adapter for zustand persist middleware
 * Handles cases where localStorage might be unavailable (SSR, disabled storage, quota exceeded, etc.)
 */

import { createJSONStorage, type PersistStorage, type StateStorage } from 'zustand/middleware'

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
export function createSafeStorage<T>(): PersistStorage<T> {
  const storage = createJSONStorage<T>(() => getSafeStateStorage())

  if (storage) {
    return storage
  }

  // In practice, this path shouldn't be hit because we always return a StateStorage implementation.
  // This is a safeguard in case createJSONStorage returns undefined.
  return createJSONStorage<T>(() => noOpStateStorage)!
}

/**
 * Returns a safe StateStorage implementation that won't throw if localStorage is unavailable
 */
function getSafeStateStorage(): StateStorage {
  const available = isLocalStorageAvailable()

  if (!available) {
    return noOpStateStorage
  }

  return safeLocalStorage
}

/**
 * No-op storage implementation for environments where localStorage is unavailable
 */
const noOpStateStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {
    // Silently fail - storage is unavailable
  },
  removeItem: () => {
    // Silently fail - storage is unavailable
  },
}

/**
 * Safe localStorage wrapper that protects against quota errors and other runtime issues
 */
const safeLocalStorage: StateStorage = {
  getItem: (name: string) => {
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
  setItem: (name: string, value: string) => {
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
  removeItem: (name: string) => {
    try {
      localStorage.removeItem(name)
    } catch (error) {
      // Log error in development, but don't throw
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[zustand persist] Failed to remove item '${name}' from localStorage:`, error)
      }
    }
  },
}

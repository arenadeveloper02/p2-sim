/**
 * Theme synchronization utilities for managing theme across next-themes and database
 */

/**
 * Updates the theme in next-themes by dispatching a storage event.
 * This works by updating localStorage and notifying next-themes of the change.
 * @param theme - The desired theme ('light' or 'dark')
 */
export function syncThemeToNextThemes(theme: 'light' | 'dark') {
  if (typeof window === 'undefined') return

  localStorage.setItem('sim-theme', theme)

  window.dispatchEvent(
    new StorageEvent('storage', {
      key: 'sim-theme',
      newValue: theme,
      oldValue: localStorage.getItem('sim-theme'),
      storageArea: localStorage,
      url: window.location.href,
    })
  )

  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(theme)
}

/**
 * Gets the current theme from next-themes localStorage
 */
export function getThemeFromNextThemes(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light'
  const theme = localStorage.getItem('sim-theme')
  // Convert 'system' to 'light' for backward compatibility
  if (theme === 'system' || !theme) return 'light'
  return theme as 'light' | 'dark'
}

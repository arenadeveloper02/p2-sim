'use client'

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { usePathname } from 'next/navigation'
import {
  LIGHT_MODE_SEGMENTS,
  SIM_THEME_STORAGE_KEY,
} from '@/app/_shell/providers/light-forced-segments'

type ColorScheme = 'light' | 'dark'
type ThemeSetting = ColorScheme | 'system'

interface ThemeContextValue {
  theme: ThemeSetting
  resolvedTheme: ColorScheme
  setTheme: (theme: ThemeSetting) => void
  forcedTheme?: ColorScheme
  themes: ColorScheme[]
  systemTheme?: ColorScheme
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

const defaultContext: ThemeContextValue = {
  theme: 'light',
  resolvedTheme: 'light',
  setTheme: () => {},
  themes: ['light', 'dark'],
}

const COLOR_SCHEMES: ColorScheme[] = ['light', 'dark']

function isThemeSetting(value: string | null): value is ThemeSetting {
  return value === 'light' || value === 'dark' || value === 'system'
}

function getSystemTheme(): ColorScheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function readStoredTheme(): ThemeSetting {
  try {
    const stored = localStorage.getItem(SIM_THEME_STORAGE_KEY)
    if (isThemeSetting(stored)) return stored
  } catch {
    return 'light'
  }
  return 'light'
}

function persistTheme(theme: ThemeSetting) {
  try {
    localStorage.setItem(SIM_THEME_STORAGE_KEY, theme)
  } catch {
    return
  }
}

function applyThemeClass(theme: ColorScheme) {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(theme)
  root.style.colorScheme = theme
}

function disableTransitions() {
  const css = document.createElement('style')
  css.appendChild(
    document.createTextNode(
      '*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}'
    )
  )
  document.head.appendChild(css)
  return () => {
    window.getComputedStyle(document.body)
    setTimeout(() => {
      document.head.removeChild(css)
    }, 1)
  }
}

/**
 * Reads the document theme for consumers that need light/dark chrome
 * (file previews, terminal, browser session). Returns defaults when rendered
 * outside {@link ThemeProvider}.
 */
export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext) ?? defaultContext
}

interface ThemeProviderProps {
  children: ReactNode
}

/**
 * Applies the document theme, forcing light on landing and auth surfaces so
 * portaled chrome matches those pages.
 *
 * Do not use `next-themes`'s `<ThemeProvider>` here. It injects an inline
 * `<script>` as a sibling of `children`; React 19 / Next then places
 * `<script id="_R_">` next to it, so the server HTML at AuthShell is a script
 * while the client hydrates a `div`. First paint is handled by the root layout
 * `beforeInteractive` script instead.
 */
export function ThemeProvider({ children }: ThemeProviderProps) {
  const pathname = usePathname()
  const firstSegment = pathname.split('/')[1]
  const forcedTheme: ColorScheme | undefined =
    firstSegment === '' || LIGHT_MODE_SEGMENTS.has(firstSegment) ? 'light' : undefined

  const [theme, setThemeState] = useState<ThemeSetting>('light')
  const [systemTheme, setSystemTheme] = useState<ColorScheme>('light')
  const [storageReady, setStorageReady] = useState(false)

  useEffect(() => {
    setThemeState(readStoredTheme())
    setSystemTheme(getSystemTheme())
    setStorageReady(true)
  }, [])

  const setTheme = useCallback((next: ThemeSetting) => {
    setThemeState(next)
    persistTheme(next)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemTheme(getSystemTheme())
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== SIM_THEME_STORAGE_KEY) return
      if (isThemeSetting(event.newValue)) {
        setThemeState(event.newValue)
        return
      }
      if (!event.newValue) setThemeState('light')
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const resolvedTheme: ColorScheme = forcedTheme ?? (theme === 'system' ? systemTheme : theme)

  useEffect(() => {
    if (!storageReady) return
    const restore = disableTransitions()
    applyThemeClass(resolvedTheme)
    restore()
  }, [resolvedTheme, storageReady])

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      forcedTheme,
      themes: COLOR_SCHEMES,
      systemTheme,
    }),
    [theme, resolvedTheme, setTheme, forcedTheme, systemTheme]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

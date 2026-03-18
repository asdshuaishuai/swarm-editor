import { useState, useEffect, useCallback } from 'react'

type Theme = 'dark' | 'light' | 'system'

const STORAGE_KEY = 'swarm-editor-theme'

export function getSystemTheme(): 'dark' | 'light' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'dark'
}

export function getStoredTheme(): Theme {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light' || stored === 'system') {
      return stored
    }
  }
  return 'dark'
}

export function setStoredTheme(theme: Theme): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, theme)
  }
}

function getEffectiveTheme(theme: Theme): 'dark' | 'light' {
  if (theme === 'system') {
    return getSystemTheme()
  }
  return theme
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme)
  const [effectiveTheme, setEffectiveTheme] = useState<'dark' | 'light'>(() =>
    getEffectiveTheme(getStoredTheme())
  )

  useEffect(() => {
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', effectiveTheme)
    document.documentElement.classList.toggle('dark', effectiveTheme === 'dark')
  }, [effectiveTheme])

  useEffect(() => {
    // Listen for system theme changes
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      const handleChange = () => {
        setEffectiveTheme(getSystemTheme())
      }
      mediaQuery.addEventListener('change', handleChange)
      return () => mediaQuery.removeEventListener('change', handleChange)
    }
  }, [theme])

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme)
    setStoredTheme(newTheme)
    setEffectiveTheme(getEffectiveTheme(newTheme))
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')
  }, [effectiveTheme, setTheme])

  return {
    theme,
    effectiveTheme,
    setTheme,
    toggleTheme,
    isDark: effectiveTheme === 'dark',
  }
}

export default useTheme

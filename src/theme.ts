// Light / dark theme. "system" follows the device; the choice is stored on
// the device only.

import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'tabi.theme'
const listeners = new Set<() => void>()
const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

export function getTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === 'light' || value === 'dark' ? value : 'system'
  } catch {
    return 'system'
  }
}

export function setTheme(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, choice)
  } catch {
    // Storage blocked: the choice lasts until the page is closed.
  }
  applyTheme(choice)
}

/** Sets `data-theme` on <html> (read by the CSS) and the browser bar color. */
export function applyTheme(choice: ThemeChoice = getTheme()): void {
  const dark = choice === 'dark' || (choice === 'system' && darkQuery.matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#1b1917' : '#f6f1e9')
  listeners.forEach((l) => l())
}

darkQuery.addEventListener('change', () => applyTheme())

function subscribe(onChange: () => void) {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

/** The stored choice (may be "system"). */
export function useTheme(): ThemeChoice {
  return useSyncExternalStore(subscribe, getTheme)
}

/** Whether the app is currently dark (after resolving "system"). */
export function useIsDark(): boolean {
  return useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme === 'dark')
}

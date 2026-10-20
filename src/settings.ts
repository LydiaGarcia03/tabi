// Device-only settings. Nothing here is ever sent anywhere except the API it
// belongs to. (Will move to IndexedDB with the rest of the data in Phase 2.)

const RAPIDAPI_KEY = 'tabi.rapidApiKey'

export function getRapidApiKey(): string | null {
  try {
    return localStorage.getItem(RAPIDAPI_KEY)
  } catch {
    return null
  }
}

export function setRapidApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(RAPIDAPI_KEY, key)
    else localStorage.removeItem(RAPIDAPI_KEY)
  } catch {
    // Storage unavailable (private mode): the key just won't persist.
  }
}

export function loadJson<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key)
    return value ? (JSON.parse(value) as T) : null
  } catch {
    return null
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore: quota exceeded or storage unavailable.
  }
}

// Google sign-in for Drive sync (Google Identity Services, token model): the
// browser gets a short-lived access token (about 1 hour) for the app's hidden
// Drive folder only. No backend, no client secret; the client ID is public.

import { loadJson, saveJson } from '../settings'

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID
/** Only the hidden app folder in the user's Drive: Tabi can't see any other file. */
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata'
const TOKEN_KEY = 'tabi.sync.token'
/** Stop using a token a minute before it expires. */
const MARGIN_MS = 60_000

interface StoredToken {
  token: string
  expiresAt: number
}

interface TokenResponse {
  access_token?: string
  expires_in?: number
  error?: string
  error_description?: string
}

interface TokenClient {
  requestAccessToken(options?: { prompt?: string; login_hint?: string }): void
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string
    scope: string
    callback: (response: TokenResponse) => void
    error_callback?: (error: { type: string; message?: string }) => void
  }): TokenClient
  revoke(token: string, done?: () => void): void
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } }
  }
}

let scriptLoading: Promise<GoogleOAuth2> | null = null

export function loadGoogleScript(): Promise<GoogleOAuth2> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google.accounts.oauth2)
  scriptLoading ??= new Promise<GoogleOAuth2>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = () => {
      const oauth2 = window.google?.accounts?.oauth2
      if (oauth2) resolve(oauth2)
      else reject(new Error("Google sign-in didn't load."))
    }
    script.onerror = () => {
      scriptLoading = null
      script.remove()
      reject(new Error("Couldn't reach Google to sign in. Check the internet connection."))
    }
    document.head.appendChild(script)
  })
  return scriptLoading
}

/** A token that is still valid, without asking anything (null = sign in again). */
export function currentToken(): string | null {
  const stored = loadJson<StoredToken>(TOKEN_KEY)
  return stored && stored.expiresAt - MARGIN_MS > Date.now() ? stored.token : null
}

export function forgetToken(): void {
  saveJson(TOKEN_KEY, null)
}

/**
 * Opens Google's sign-in window (must run from a tap: browsers block pop-ups
 * otherwise). With `email`, an account that already allowed Tabi just confirms.
 */
export async function requestToken(email?: string): Promise<string> {
  if (!GOOGLE_CLIENT_ID) throw new Error('Sync is not set up in this build (VITE_GOOGLE_CLIENT_ID is missing).')
  const oauth2 = await loadGoogleScript()
  return new Promise<string>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: SCOPE,
      callback: (response) => {
        if (!response.access_token) {
          reject(new Error(response.error_description || response.error || 'Google sign-in failed.'))
          return
        }
        saveJson(TOKEN_KEY, { token: response.access_token, expiresAt: Date.now() + (response.expires_in ?? 3600) * 1000 })
        resolve(response.access_token)
      },
      error_callback: (error) =>
        reject(new Error(error.type === 'popup_closed' ? 'Sign-in window closed.' : error.message || 'Google sign-in failed.')),
    })
    client.requestAccessToken(email ? { prompt: '', login_hint: email } : { prompt: 'select_account' })
  })
}

/** Signs out: Tabi's access to the Drive folder is revoked (files stay in Drive). */
export async function revokeToken(): Promise<void> {
  const token = currentToken()
  forgetToken()
  if (!token) return
  try {
    const oauth2 = await loadGoogleScript()
    await new Promise<void>((resolve) => oauth2.revoke(token, resolve))
  } catch {
    // Offline: the token expires by itself within the hour.
  }
}

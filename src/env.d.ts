interface ImportMetaEnv {
  /** Google Maps Platform key (referrer-restricted). Provided by .env.local or the CI secret. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  /** OAuth client ID for Drive sync (public, not a secret). Provided by .env.local or the CI secret. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

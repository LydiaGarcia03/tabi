interface ImportMetaEnv {
  /** Google Maps Platform key (referrer-restricted). Provided by .env.local or the CI secret. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
  /** OAuth client ID for Drive sync (public, not a secret). Provided by .env.local or the CI secret. */
  readonly VITE_GOOGLE_CLIENT_ID?: string
  /** Google Cloud project ID, for the API usage debug panel (`npm run dev` only). Provided by .env.local. */
  readonly VITE_GOOGLE_CLOUD_PROJECT?: string
  /** The project owner's Google account, preselected by the API usage debug panel. Provided by .env.local. */
  readonly VITE_GOOGLE_ACCOUNT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

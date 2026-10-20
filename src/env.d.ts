interface ImportMetaEnv {
  /** Google Maps Platform key (referrer-restricted). Provided by .env.local or the CI secret. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

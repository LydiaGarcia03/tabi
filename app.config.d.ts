/** The shape of app.config.json: the app's name and version (read by vite.config.ts, given to the app as __APP__). */
interface AppConfig {
  name: string
  nameJapanese: string
  description: string
  /** major.minor.patch: patch/minor bumped with each deploy, major only when User decides. */
  version: string
}

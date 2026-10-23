import { useState } from 'react'
import { getRapidApiKey, setRapidApiKey } from './settings'
import { syncNow } from './sync/sync'

export function SettingsPanel() {
  const [key, setKey] = useState(() => getRapidApiKey() ?? '')
  const [saved, setSaved] = useState(false)

  return (
    <section className="card">
      <h2>Transit suggestions</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setRapidApiKey(key.trim())
          setSaved(true)
          void syncNow()
        }}
      >
        <label>
          RapidAPI key (NAVITIME)
          <input
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => {
              setKey(e.target.value)
              setSaved(false)
            }}
          />
        </label>
        <p className="muted small">
          Stored on this device, and in your Google Drive when you are signed in (Account &amp; sync). Never sent anywhere
          else except RapidAPI.
        </p>
        <button type="submit">Save</button> {saved && <span className="muted small">Saved.</span>}
      </form>
    </section>
  )
}

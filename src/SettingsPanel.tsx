import { useState } from 'react'
import { getRapidApiKey, setRapidApiKey } from './settings'

export function SettingsPanel() {
  const [key, setKey] = useState(() => getRapidApiKey() ?? '')
  const [saved, setSaved] = useState(false)

  return (
    <section className="card">
      <h2>Settings</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setRapidApiKey(key.trim())
          setSaved(true)
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
        <p className="muted small">Stored only on this device. Never sent anywhere except RapidAPI.</p>
        <button type="submit">Save</button> {saved && <span className="muted small">Saved.</span>}
      </form>
    </section>
  )
}

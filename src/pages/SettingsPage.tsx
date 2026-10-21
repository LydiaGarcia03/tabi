import { SettingsPanel } from '../SettingsPanel'
import { href } from '../router'
import { setTheme, useTheme, type ThemeChoice } from '../theme'

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: 'system', label: 'Same as device' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

export function SettingsPage() {
  const theme = useTheme()
  return (
    <>
      <div className="page-title">
        <h1>Settings</h1>
      </div>
      <section className="card">
        <h2>Appearance</h2>
        <div className="segmented" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={theme === t.value}
              className={theme === t.value ? 'active' : ''}
              onClick={() => setTheme(t.value)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </section>
      <SettingsPanel />
      <section className="card">
        <h2>Developer</h2>
        <a href={href({ page: 'transit-spike' })}>Transit spike (Google vs NAVITIME)</a>
      </section>
    </>
  )
}

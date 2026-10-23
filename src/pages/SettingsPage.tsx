import { Icon } from '../components/Icon'
import { SyncCard } from '../components/SyncCard'
import { installApp, useInstallState } from '../install'
import { SettingsPanel } from '../SettingsPanel'
import { href, settingsBackHref } from '../router'
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
      <div className="page-title row">
        <a className="icon-button" href={settingsBackHref()} aria-label="Back" title="Back">
          <Icon name="back" size={20} />
        </a>
        <h1>Settings</h1>
      </div>
      <SyncCard />
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
      <InstallCard />
      <SettingsPanel />
      <section className="card">
        <h2>Developer</h2>
        <p>
          <a href={href({ page: 'transit-spike' })}>Transit spike (Google vs NAVITIME)</a>
        </p>
        <p>
          <a href={href({ page: 'icons' })}>Icons</a>
        </p>
      </section>
    </>
  )
}

function InstallCard() {
  const state = useInstallState()
  const offlineReady = 'serviceWorker' in navigator && navigator.serviceWorker.controller != null
  return (
    <section className="card">
      <h2>Install the app</h2>
      {state === 'installed' && <p className="muted small">Tabi is installed on this device.</p>}
      {state === 'ready' && (
        <>
          <p className="muted small">Opens in its own window, with its icon among your apps, and works without internet.</p>
          <div className="row">
            <button type="button" className="primary" onClick={() => void installApp()}>
              Install Tabi
            </button>
          </div>
        </>
      )}
      {state === 'unavailable' && (
        <>
          <p className="muted small">Chrome hasn't offered to install the app here. Things to check on the phone:</p>
          <ul className="small install-tips">
            <li>Open the site in the Chrome app itself: not in a link preview inside another app, and not in an incognito tab.</li>
            <li>Chrome menu (⋮) → <strong>Install app</strong> (or <strong>Add to home screen</strong> → <strong>Install</strong>).</li>
            <li>If only "Create shortcut" shows up: remove the old Tabi shortcut from the home screen, close the tab, open the site again and wait a few seconds before opening the menu.</li>
          </ul>
        </>
      )}
      <p className="muted small">
        {offlineReady ? (
          <>
            <Icon name="check" size={14} /> Saved for offline use on this device.
          </>
        ) : (
          'Not saved for offline use yet: reload the page once.'
        )}
      </p>
    </section>
  )
}

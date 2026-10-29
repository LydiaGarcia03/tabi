import { useState } from 'react'
import { DEBUG_FEATURES, useDebugFeatures, type DebugFeature } from '../../debug'
import { Icon } from '../Icon'
import { ApiUsagePanel } from './ApiUsagePanel'
import { FakeGpsPanel } from './FakeGpsPanel'

/**
 * `npm run dev` only: a button in the top bar for each debug feature turned on in Settings; a tap opens its panel
 * in the corner of the screen (one at a time), closed with ✕ or another tap on the button.
 */
export function DebugBar() {
  const enabled = useDebugFeatures()
  const [open, setOpen] = useState<DebugFeature | null>(null)
  const features = DEBUG_FEATURES.filter((f) => enabled[f.id])
  const shown = features.find((f) => f.id === open)
  if (features.length === 0) return null

  return (
    <>
      {features.map((f) => (
        <button
          key={f.id}
          type="button"
          className={`icon-button debug-button${open === f.id ? ' active' : ''}`}
          aria-label={f.label}
          aria-pressed={open === f.id}
          title={`${f.label} (debug)`}
          onClick={() => setOpen(open === f.id ? null : f.id)}
        >
          <Icon name={f.icon} size={19} />
        </button>
      ))}
      {shown && (
        <section className="debug-popup" aria-label={shown.label}>
          <header className="debug-popup-bar">
            <strong>{shown.label}</strong>
            <span className="muted small">debug</span>
            <button type="button" className="icon-button" aria-label="Close" title="Close" onClick={() => setOpen(null)}>
              <Icon name="close" size={18} />
            </button>
          </header>
          <div className="debug-popup-body">{shown.id === 'fakeGps' ? <FakeGpsPanel /> : <ApiUsagePanel />}</div>
        </section>
      )}
    </>
  )
}

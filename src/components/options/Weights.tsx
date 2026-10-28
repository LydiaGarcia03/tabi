import { useState } from 'react'
import { Icon } from '../Icon'
import { Sheet } from '../Sheet'
import { type Weights } from '../../planning/compare'

/** A quiet link at the end of the page: how scores are made and the weights, in a sheet. */
export function WeightsLink({ weights, onChange }: { weights: Weights; onChange: (w: Weights) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="weights-link">
      <button type="button" className="link" onClick={() => setOpen(true)}>
        <Icon name="settings" size={16} /> How the score works · weights
      </button>
      {open && (
        <Sheet title="How the score works" onClose={() => setOpen(false)}>
          <WeightsPanel weights={weights} onChange={onChange} />
          <div className="row wrap sheet-actions">
            <button type="button" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </Sheet>
      )}
    </div>
  )
}

export function WeightsPanel({ weights, onChange }: { weights: Weights; onChange: (w: Weights) => void }) {
  const sliders: { key: keyof Weights; label: string }[] = [
    { key: 'price', label: 'Price' },
    { key: 'distance', label: 'Distance / travel time' },
    { key: 'rating', label: 'Your rating' },
  ]
  return (
    <div className="weights-panel">
      <p className="muted small">
        Within each group, every option gets 0–100 from how cheap, how close and how highly you rated it, compared with
        the others. Hotels compare the total for the stay. Choose what matters more:
      </p>
      <div className="weights">
        {sliders.map((s) => (
          <label key={s.key}>
            {s.label}: {['ignore', 'low', 'normal', 'high'][weights[s.key]]}
            <input
              type="range"
              min="0"
              max="3"
              step="1"
              value={weights[s.key]}
              onChange={(e) => onChange({ ...weights, [s.key]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
    </div>
  )
}

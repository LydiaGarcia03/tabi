import { useEffect, useState, useSyncExternalStore } from 'react'
import { getFakeGps, moveBy, setFakeGps, subscribeFakeGps, type FakeGps } from '../../fakeGps'
import { parseCoordinates } from '../../places/coordinates'

const STEPS = [10, 50, 200]

/**
 * Debug feature: a made-up GPS position (pasted as "lat, lng" or a Google Maps link, then moved with
 * N / S / W / E) and compass heading, to test the Logbook on a PC whose location is off.
 */
export function FakeGpsPanel() {
  const fake = useSyncExternalStore(subscribeFakeGps, getFakeGps)
  const [text, setText] = useState('')
  const [step, setStep] = useState(10)
  const [bad, setBad] = useState(false)
  const current: FakeGps = fake ?? { on: false, lat: 0, lng: 0, accuracy: 9, heading: null, time: 0 }
  const update = (changes: Partial<FakeGps>) => setFakeGps({ ...current, ...changes, time: Date.now() })

  // A real GPS answers every few seconds: keep the fake one fresh so it never shows as stale.
  const on = !!fake?.on
  useEffect(() => {
    if (!on) return
    const id = setInterval(() => {
      const latest = getFakeGps()
      if (latest) setFakeGps({ ...latest, time: Date.now() })
    }, 5_000)
    return () => clearInterval(id)
  }, [on])

  const place = () => {
    const point = parseCoordinates(text)
    setBad(!point)
    if (point) {
      update({ ...point, on: true })
      setText('')
    }
  }
  const move = (north: number, east: number) => update(moveBy(current, north * step, east * step))

  return (
    <div className="fake-gps-body small">
      <label className="check">
        <input type="checkbox" checked={on} disabled={!fake} onChange={(e) => update({ on: e.target.checked })} />
        Use the fake position (instead of the real GPS)
      </label>
      <div className="row">
        <input
          value={text}
          placeholder="lat, lng or a Google Maps link"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && place()}
        />
        <button type="button" onClick={place}>
          Set
        </button>
      </div>
      {bad && <span className="error">No coordinates found in that text.</span>}
      <span className="muted">{fake ? `${current.lat.toFixed(7)}, ${current.lng.toFixed(7)}` : 'No position yet: paste one above.'}</span>
      {fake && (
        <>
          <div className="fake-gps-move">
            <span className="segmented" role="radiogroup" aria-label="Step">
              {STEPS.map((s) => (
                <button key={s} type="button" role="radio" aria-checked={step === s} className={step === s ? 'active' : ''} onClick={() => setStep(s)}>
                  {s} m
                </button>
              ))}
            </span>
            <span className="fake-gps-pad">
              <button type="button" onClick={() => move(1, 0)}>N</button>
              <button type="button" onClick={() => move(0, -1)}>W</button>
              <button type="button" onClick={() => move(0, 1)}>E</button>
              <button type="button" onClick={() => move(-1, 0)}>S</button>
            </span>
          </div>
          <label className="fake-gps-field">
            Precision (m)
            <input type="number" min={1} value={current.accuracy} onChange={(e) => update({ accuracy: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
          <label className="check">
            <input type="checkbox" checked={current.heading != null} onChange={(e) => update({ heading: e.target.checked ? 0 : null })} />
            Compass: the phone points to {current.heading ?? '—'}°
          </label>
          {current.heading != null && (
            <input type="range" min={0} max={359} value={current.heading} onChange={(e) => update({ heading: Number(e.target.value) })} />
          )}
        </>
      )}
    </div>
  )
}

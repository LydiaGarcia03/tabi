import { DEBUG_FEATURES, setDebugFeature, useDebugFeatures } from '../../debug'

/** Settings → Debug features (`npm run dev` only): which debug tools get a button in the top bar. */
export function DebugSettings() {
  const enabled = useDebugFeatures()
  return (
    <section className="card">
      <h2>Debug features</h2>
      <p className="muted small">Only when running locally (npm run dev). Each one turned on gets a button in the top bar.</p>
      <div className="debug-features">
        {DEBUG_FEATURES.map((f) => (
          <label key={f.id} className="check debug-feature">
            <input type="checkbox" role="switch" className="toggle" checked={!!enabled[f.id]} onChange={(e) => setDebugFeature(f.id, e.target.checked)} />
            <span>
              <strong>{f.label}</strong>
              <span className="muted small"> · {f.description}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  )
}

import type { RouteResult } from '../routing/types'
import { MODE_COLOR, MODE_LABEL, formatDistance, formatDuration, formatMoney, formatTime } from './format'

interface Props {
  result: RouteResult
  selectedIndex: number | null
  onSelect: (index: number) => void
}

export function RouteResultView({ result, selectedIndex, onSelect }: Props) {
  return (
    <div className="result">
      <p className="muted small">Fetched {new Date(result.fetchedAt).toLocaleString()}</p>

      {result.notes.length > 0 && (
        <ul className="notes">
          {result.notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      )}

      {result.options.map((option, i) => (
        <article key={i} className={`option${selectedIndex === i ? ' selected' : ''}`}>
          <div className="option-summary">
            <strong>Option {i + 1}</strong>
            <button type="button" className="link" onClick={() => onSelect(i)} disabled={selectedIndex === i}>
              {selectedIndex === i ? 'On map' : 'Show on map'}
            </button>
            <span>
              {formatTime(option.departureTime)} → {formatTime(option.arrivalTime)}
            </span>
            <span>{formatDuration(option.durationMinutes)}</span>
            <span>{formatMoney(option.fare)}</span>
            <span>{option.transfers ?? '—'} transfer(s)</span>
          </div>
          <ol className="segments">
            {option.segments.map((segment, j) => (
              <li key={j} style={{ borderLeftColor: segment.color ?? MODE_COLOR[segment.mode] }}>
                <div>
                  <strong>{MODE_LABEL[segment.mode]}</strong>
                  {segment.lineName && <> · {segment.lineName}</>}
                  {segment.operator && <span className="muted"> ({segment.operator})</span>}
                </div>
                <div className="small">
                  {segment.fromName ?? '?'} → {segment.toName ?? '?'}
                </div>
                <div className="small muted">
                  {segment.departureTime && <>{formatTime(segment.departureTime)}–{formatTime(segment.arrivalTime)} · </>}
                  {formatDuration(segment.durationMinutes)} · {formatDistance(segment.distanceMeters)}
                  {segment.fare && <> · {formatMoney(segment.fare)}</>}
                </div>
              </li>
            ))}
          </ol>
        </article>
      ))}

      <details>
        <summary>Raw response</summary>
        <pre>{JSON.stringify(result.raw, null, 2)}</pre>
      </details>
    </div>
  )
}

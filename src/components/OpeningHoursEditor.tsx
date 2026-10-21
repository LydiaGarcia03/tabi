import type { OpeningHours, TimeRange } from '../db/model'
import { WEEKDAYS } from '../planning/hours'
import { useDraft } from '../useDraft'

type Mode = 'none' | 'same' | 'varies'

/** Display order: Monday first. */
const WEEK = [1, 2, 3, 4, 5, 6, 0]
const DEFAULT_RANGE: TimeRange = { open: '09:00', close: '17:00' }

interface Props {
  value: OpeningHours | undefined
  onChange: (value: OpeningHours | undefined) => void
}

/** Opening hours typed by the user: the same every day (with closed days) or per day. */
export function OpeningHoursEditor({ value, onChange }: Props) {
  const mode = modeOf(value)
  const days = value?.days ?? []
  const shared = firstRange(days) ?? DEFAULT_RANGE
  const [note, setNote] = useDraft(value?.note ?? '', (text) => value && onChange({ ...value, note: text.trim() || undefined }))

  function setMode(next: Mode) {
    if (next === 'none') return onChange(undefined)
    const range = shared
    onChange({
      note: value?.note,
      perDay: next === 'varies',
      days:
        next === 'varies' && value
          ? WEEKDAYS.map((_, d) => days[d] ?? null)
          : // Same hours on every day that isn't closed.
            WEEKDAYS.map((_, d) => (value && days[d] === null ? null : range)),
    })
  }

  function setDay(day: number, range: TimeRange | null) {
    onChange({ ...value, days: WEEKDAYS.map((_, d) => (d === day ? range : (days[d] ?? null))) })
  }

  function setAllRanges(change: Partial<TimeRange>) {
    // With every day closed, reopening them all is the only way to set hours.
    const open = days.some((r) => r != null)
    onChange({ ...value, days: days.map((r) => (r ? { ...r, ...change } : open ? null : { ...shared, ...change })) })
  }

  return (
    <fieldset className="hours-editor">
      <legend>Opening hours</legend>
      <div className="segmented" role="radiogroup" aria-label="Opening hours">
        {(
          [
            ['none', 'Not set'],
            ['same', 'Same every day'],
            ['varies', 'Varies by day'],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            className={mode === m ? 'active' : ''}
            onClick={() => setMode(m)}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'same' && (
        <>
          <div className="field-row">
            <label>
              Opens
              <input type="time" value={shared.open} onChange={(e) => e.target.value && setAllRanges({ open: e.target.value })} />
            </label>
            <label>
              Closes
              <input type="time" value={shared.close} onChange={(e) => e.target.value && setAllRanges({ close: e.target.value })} />
            </label>
          </div>
          <div className="closed-days">
            <span className="small">Closed on:</span>
            {WEEK.map((d) => (
              <button
                key={d}
                type="button"
                className={`day-toggle${days[d] === null ? ' active' : ''}`}
                aria-pressed={days[d] === null}
                onClick={() => setDay(d, days[d] === null ? shared : null)}
              >
                {WEEKDAYS[d]}
              </button>
            ))}
          </div>
        </>
      )}

      {mode === 'varies' && (
        <ul className="hours-days">
          {WEEK.map((d) => {
            const range = days[d] ?? null
            return (
              <li key={d}>
                <label className="hours-day-open">
                  <input
                    type="checkbox"
                    checked={range !== null}
                    onChange={(e) => setDay(d, e.target.checked ? (firstRange(days) ?? DEFAULT_RANGE) : null)}
                  />
                  {WEEKDAYS[d]}
                </label>
                {range ? (
                  <span className="hours-day-times">
                    <input
                      type="time"
                      aria-label={`${WEEKDAYS[d]} opens`}
                      value={range.open}
                      onChange={(e) => e.target.value && setDay(d, { ...range, open: e.target.value })}
                    />
                    –
                    <input
                      type="time"
                      aria-label={`${WEEKDAYS[d]} closes`}
                      value={range.close}
                      onChange={(e) => e.target.value && setDay(d, { ...range, close: e.target.value })}
                    />
                  </span>
                ) : (
                  <span className="muted small">Closed</span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {mode !== 'none' && (
        <label>
          Hours note
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Last entry 16:30, closed on holidays…" />
        </label>
      )}
      {mode !== 'none' && <p className="muted small">A closing time after midnight is fine (e.g. 18:00–02:00).</p>}
    </fieldset>
  )
}

function modeOf(value: OpeningHours | undefined): Mode {
  if (!value) return 'none'
  return value.perDay ? 'varies' : 'same'
}

function firstRange(days: (TimeRange | null)[]): TimeRange | undefined {
  return days.find((r): r is TimeRange => r != null)
}

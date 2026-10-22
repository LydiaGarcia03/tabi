import type { OpeningHours, TimeRange } from '../db/model'
import { formatMinutes, toMinutes, WEEKDAYS } from '../planning/hours'
import { useDraft } from '../useDraft'

type Mode = 'none' | 'same' | 'varies'
type DayHours = TimeRange[] | null

/** Display order: Monday first. */
const WEEK = [1, 2, 3, 4, 5, 6, 0]
const DEFAULT_RANGES: TimeRange[] = [{ open: '09:00', close: '17:00' }]

interface Props {
  value: OpeningHours | undefined
  onChange: (value: OpeningHours | undefined) => void
}

/**
 * Opening hours typed by the user: the same every day (with closed days) or
 * per day, each day with one or more time ranges (e.g. lunch and dinner).
 */
export function OpeningHoursEditor({ value, onChange }: Props) {
  const mode = modeOf(value)
  const days: DayHours[] = WEEKDAYS.map((_, d) => value?.days[d] ?? null)
  const anyOpen = days.some((r) => r != null)
  const shared = firstOpen(days) ?? DEFAULT_RANGES
  const [note, setNote] = useDraft(value?.note ?? '', (text) => value && onChange({ ...value, note: text.trim() || undefined }))

  function setMode(next: Mode) {
    if (next === 'none') return onChange(undefined)
    onChange({
      note: value?.note,
      perDay: next === 'varies',
      days:
        next === 'varies' && value
          ? days
          : // Same hours on every day that isn't closed.
            days.map((r) => (value && r === null ? null : shared)),
    })
  }

  function setDay(day: number, ranges: DayHours) {
    onChange({ ...value, days: days.map((r, d) => (d === day ? ranges : r)) })
  }

  function setSharedRanges(ranges: TimeRange[]) {
    onChange({ ...value, days: days.map((r) => (r ? ranges : null)) })
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
          <div className="open-days">
            <span className="small">Open on:</span>
            {WEEK.map((d) => (
              <button
                key={d}
                type="button"
                className={`day-toggle${days[d] ? ' active' : ''}`}
                aria-pressed={days[d] != null}
                title={days[d] ? `Open on ${WEEKDAYS[d]}` : `Closed on ${WEEKDAYS[d]}`}
                onClick={() => setDay(d, days[d] ? null : shared)}
              >
                {WEEKDAYS[d]}
              </button>
            ))}
          </div>
          {anyOpen ? (
            <RangesEditor ranges={shared} onChange={setSharedRanges} label="Every open day" />
          ) : (
            <p className="muted small">Closed every day. Tap the days it opens.</p>
          )}
        </>
      )}

      {mode === 'varies' && (
        <ul className="hours-days">
          {WEEK.map((d) => {
            const ranges = days[d]
            return (
              <li key={d}>
                <button
                  type="button"
                  className={`day-toggle${ranges ? ' active' : ''}`}
                  aria-pressed={ranges != null}
                  title={ranges ? `Open on ${WEEKDAYS[d]} (tap to close)` : `Closed on ${WEEKDAYS[d]} (tap to open)`}
                  onClick={() => setDay(d, ranges ? null : (firstOpen(days) ?? DEFAULT_RANGES))}
                >
                  {WEEKDAYS[d]}
                </button>
                {ranges ? (
                  <RangesEditor ranges={ranges} onChange={(next) => setDay(d, next)} label={WEEKDAYS[d]} compact />
                ) : (
                  <span className="muted small">Closed</span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Only per day (or to edit a note already typed). */}
      {(mode === 'varies' || (mode === 'same' && value?.note)) && (
        <label>
          Hours note
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Last entry 16:30, closed on holidays…" />
        </label>
      )}
    </fieldset>
  )
}

/** One or more "opens – closes" rows, with add and remove. */
function RangesEditor({
  ranges,
  onChange,
  label,
  compact = false,
}: {
  ranges: TimeRange[]
  onChange: (ranges: TimeRange[]) => void
  label: string
  compact?: boolean
}) {
  const set = (i: number, change: Partial<TimeRange>) => onChange(ranges.map((r, j) => (j === i ? { ...r, ...change } : r)))
  const several = ranges.length > 1
  return (
    <div className={`hours-ranges${compact ? ' compact' : ''}`}>
      {ranges.map((range, i) => {
        const which = several ? ` (${i + 1})` : ''
        return (
          <span key={i} className="hours-range">
            <input
              type="time"
              aria-label={`${label} opens${which}`}
              value={range.open}
              onChange={(e) => e.target.value && set(i, { open: e.target.value })}
            />
            –
            <input
              type="time"
              aria-label={`${label} closes${which}`}
              value={range.close}
              onChange={(e) => e.target.value && set(i, { close: e.target.value })}
            />
            {several && (
              <button
                type="button"
                className="ghost icon-button"
                onClick={() => onChange(ranges.filter((_, j) => j !== i))}
                aria-label={`Remove ${label} hours${which}`}
                title="Remove these hours"
              >
                ✕
              </button>
            )}
          </span>
        )
      })}
      {compact ? (
        <button
          type="button"
          className="ghost icon-button"
          onClick={() => onChange([...ranges, nextRange(ranges)])}
          aria-label={`Add hours on ${label}`}
          title="Add hours (e.g. after a break)"
        >
          +
        </button>
      ) : (
        <button type="button" className="link" onClick={() => onChange([...ranges, nextRange(ranges)])}>
          + Add hours
        </button>
      )}
    </div>
  )
}

/** A new range one hour after the last one closes, four hours long. */
function nextRange(ranges: TimeRange[]): TimeRange {
  const last = ranges[ranges.length - 1]
  const open = toMinutes(last.close) + 60
  return { open: formatMinutes(open), close: formatMinutes(open + 240) }
}

function modeOf(value: OpeningHours | undefined): Mode {
  if (!value) return 'none'
  return value.perDay ? 'varies' : 'same'
}

function firstOpen(days: DayHours[]): TimeRange[] | undefined {
  return days.find((r): r is TimeRange[] => r != null && r.length > 0)
}

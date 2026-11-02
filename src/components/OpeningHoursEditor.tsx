import type { OpeningHours, TimeRange } from '../db/model'
import { ALL_DAY, formatMinutes, isAllDay, toMinutes, WEEKDAYS } from '../planning/hours'
import { useDraft } from '../useDraft'
import { Icon } from './Icon'

type Mode = 'none' | 'same' | 'varies'
type DayHours = TimeRange[] | null

/** Display order: Monday first. */
const WEEK = [1, 2, 3, 4, 5, 6, 0]
const DEFAULT_RANGES: TimeRange[] = [{ open: '09:00', close: '17:00' }]

/** The three ways, with a shorter label for phones. */
const MODES: [Mode, string, string][] = [
  ['none', 'Not set', 'Not set'],
  ['same', 'Same every day', 'Every day'],
  ['varies', 'Varies by day', 'By day'],
]

interface Props {
  value: OpeningHours | undefined
  onChange: (value: OpeningHours | undefined) => void
  /** Without its box and "Opening hours" title (the place editor shows a door icon beside it instead). */
  bare?: boolean
}

/**
 * Opening hours typed by the user: the same every day (with closed days) or
 * per day, each day with one or more time ranges (e.g. lunch and dinner).
 * Each range is one box "🕐 11:00 – 15:00"; a second one goes under the first (User's choices from the
 * place editor mock, 2026-11-01), and "24h" is offered only while a day has a single range.
 */
export function OpeningHoursEditor({ value, onChange, bare = false }: Props) {
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

  const Box = bare ? 'div' : 'fieldset'
  return (
    <Box className={`hours-editor${bare ? ' bare' : ''}`}>
      {!bare && <legend>Opening hours</legend>}
      {/* "Open on" inside the choice, before its buttons (User, 2026-11-01): it reads "Open on: Same every day". */}
      <div className="segmented hours-mode" role="radiogroup" aria-label="Open on">
        <span className="hours-mode-label" aria-hidden="true">
          Open on
        </span>
        {MODES.map(([m, label, short]) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            aria-label={label}
            className={mode === m ? 'active' : ''}
            onClick={() => setMode(m)}
          >
            <span className="hours-mode-long">{label}</span>
            <span className="hours-mode-short">{short}</span>
          </button>
        ))}
      </div>

      {mode === 'same' && (
        <>
          <div className="open-days">
            <div className="open-week">
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
                  <RangesEditor ranges={ranges} onChange={(next) => setDay(d, next)} label={WEEKDAYS[d]} />
                ) : (
                  <span className="muted small hours-closed">Closed</span>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* Only per day (or to edit a note already typed). */}
      {(mode === 'varies' || (mode === 'same' && value?.note)) && (
        <input
          className="hours-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Hours note · last entry 16:30, closed on holidays…"
          aria-label="Hours note"
        />
      )}
    </Box>
  )
}

/** One line per "opens – closes" range, one under the other; "+" at the end of the last one adds another. */
function RangesEditor({ ranges, onChange, label }: { ranges: TimeRange[]; onChange: (ranges: TimeRange[]) => void; label: string }) {
  const add = (from: TimeRange[]) => onChange([...from, nextRange(from)])
  const addButton = (from: TimeRange[]) => (
    <button
      type="button"
      className="ghost icon-button hours-add"
      onClick={() => add(from)}
      aria-label={`Add hours on ${label}`}
      title="Add hours after a break (e.g. lunch and dinner)"
    >
      <Icon name="plus" size={16} />
    </button>
  )

  if (isAllDay(ranges))
    return (
      <div className="hours-ranges">
        <span className="hours-range">
          <span className="hours-times all-day">
            <Icon name="clock" size={15} />
            Open 24 hours
          </span>
          <button
            type="button"
            className="hours-24 active"
            aria-pressed="true"
            aria-label={`${label}: open all day`}
            title="Open 24 hours (tap to set times)"
            onClick={() => onChange(DEFAULT_RANGES)}
          >
            24h
          </button>
          {addButton(DEFAULT_RANGES)}
        </span>
      </div>
    )

  const set = (i: number, change: Partial<TimeRange>) => onChange(ranges.map((r, j) => (j === i ? { ...r, ...change } : r)))
  const several = ranges.length > 1
  return (
    <div className="hours-ranges">
      {ranges.map((range, i) => {
        const which = several ? ` (${i + 1})` : ''
        return (
          <span key={i} className="hours-range">
            <span className="hours-times">
              <Icon name="clock" size={15} />
              <input
                type="time"
                aria-label={`${label} opens${which}`}
                value={range.open}
                onChange={(e) => e.target.value && set(i, { open: e.target.value })}
              />
              <span className="hours-dash">–</span>
              <input
                type="time"
                aria-label={`${label} closes${which}`}
                value={range.close}
                onChange={(e) => e.target.value && set(i, { close: e.target.value })}
              />
            </span>
            {several ? (
              <button
                type="button"
                className="ghost icon-button hours-remove"
                onClick={() => onChange(ranges.filter((_, j) => j !== i))}
                aria-label={`Remove ${label} hours${which}`}
                title="Remove these hours"
              >
                <Icon name="close" size={16} />
              </button>
            ) : (
              <button
                type="button"
                className="hours-24"
                aria-pressed="false"
                aria-label={`${label}: open all day`}
                title="Open 24 hours"
                onClick={() => onChange([ALL_DAY])}
              >
                24h
              </button>
            )}
            {i === ranges.length - 1 && addButton(ranges)}
          </span>
        )
      })}
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

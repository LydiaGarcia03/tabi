import { useMemo, useState } from 'react'
import type { Day, Leg, Place } from '../db/model'
import { applyDayOrder } from '../db/trips'
import { formatDuration } from '../format'
import { DEFAULT_VISIT_MINUTES, formatMinutes, toMinutes, weekdayOf, WEEKDAYS } from '../planning/hours'
import { buildSchedule, optimizeOrder, travelBetween, type Optimized, type Schedule } from '../planning/optimize'

interface Props {
  day: Day
  /** The day's places in the current order. */
  places: Place[]
  legs: Map<string, Leg>
  onClose: () => void
}

/** Suggests the best visiting order of the day; nothing changes until "Apply". */
export function OptimizePanel({ day, places, legs, onClose }: Props) {
  const [start, setStart] = useState(places[0]?.plannedTime ?? '09:00')
  const [fixFirst, setFixFirst] = useState(false)
  const [fixLast, setFixLast] = useState(false)
  const [setTimes, setSetTimes] = useState(true)
  const [result, setResult] = useState<Optimized | null>(null)
  const weekday = weekdayOf(day.date)
  const startMinutes = toMinutes(start || '09:00')

  const current = useMemo(
    () => buildSchedule(places, startMinutes, weekday, (a, b) => travelBetween(a, b, legs)),
    [places, startMinutes, weekday, legs],
  )
  const unchanged = result && result.order.every((p, i) => p.id === places[i]?.id)

  function optimize() {
    setResult(optimizeOrder(places, { start: startMinutes, weekday, fixFirst, fixLast, legs }))
  }

  async function apply() {
    if (!result) return
    const times = setTimes
      ? new Map(result.schedule.stops.filter((s) => !s.closed).map((s) => [s.place.id, formatMinutes(s.start)]))
      : undefined
    await applyDayOrder(
      day.id,
      result.order.map((p) => p.id),
      times,
    )
    onClose()
  }

  // Options changed: the old suggestion no longer applies.
  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v)
    setResult(null)
  }

  return (
    <section className="card optimize-panel">
      <h2>Optimize order</h2>
      <p className="muted small">
        Finds the order that respects opening hours ({WEEKDAYS[weekday]}) and visit times, then finishes earliest.
        Travel times come from your saved routes, or are estimated from the distance.
      </p>
      <div className="field-row">
        <label>
          Start the day at
          <input type="time" value={start} onChange={(e) => reset(setStart)(e.target.value)} />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={fixFirst} onChange={(e) => reset(setFixFirst)(e.target.checked)} />
        Keep “{places[0]?.name}” first
      </label>
      <label className="check">
        <input type="checkbox" checked={fixLast} onChange={(e) => reset(setFixLast)(e.target.checked)} />
        Keep “{places.at(-1)?.name}” last
      </label>
      <div className="row wrap">
        <button type="button" className="primary" onClick={optimize}>
          Find best order
        </button>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </div>

      {result && (
        <div className="optimize-result">
          {unchanged ? (
            <p>
              <strong>Your current order is already the best.</strong>
            </p>
          ) : (
            <>
              <p className="optimize-compare">
                <span>
                  <strong>Suggested:</strong> {summary(result.schedule)}
                </span>
                <span className="muted">Current: {summary(current)}</span>
              </p>
              <ScheduleList schedule={result.schedule} />
            </>
          )}
          {!result.exact && (
            <p className="muted small">Many places: a very good order was found, but not every possible order was tried.</p>
          )}
          {result.schedule.lateMinutes > 0 && (
            <p className="warning small">
              Some visits still don't fit the opening hours: try another start time, another day, or fewer places.
            </p>
          )}
          {!unchanged && (
            <>
              <label className="check">
                <input type="checkbox" checked={setTimes} onChange={(e) => setSetTimes(e.target.checked)} />
                Also set the planned times
              </label>
              <div className="row wrap">
                <button type="button" className="primary" onClick={apply}>
                  Apply this order
                </button>
              </div>
            </>
          )}
          <p className="muted small">
            Places without opening hours count as always open; without a visit time, as {DEFAULT_VISIT_MINUTES} min.
          </p>
        </div>
      )}
    </section>
  )
}

function summary(s: Schedule): string {
  const parts = [`ends ${formatMinutes(s.finish)}`, `${formatDuration(s.travelMinutes)} travel`]
  if (s.waitMinutes > 0) parts.push(`${formatDuration(s.waitMinutes)} waiting`)
  parts.push(s.conflicts ? `${s.conflicts} conflict${s.conflicts > 1 ? 's' : ''}` : 'no conflicts')
  return parts.join(' · ')
}

function ScheduleList({ schedule }: { schedule: Schedule }) {
  return (
    <ol className="schedule">
      {schedule.stops.map((stop, i) =>
        stop.closed ? (
          <li key={stop.place.id}>
            <span className="schedule-stop">
              <span className="schedule-time">—</span>
              <span>
                {i + 1}. {stop.place.name}
                <span className="warning small"> · closed this day, not scheduled (move it to another day?)</span>
              </span>
            </span>
          </li>
        ) : (
        <li key={stop.place.id}>
          {stop.travel && (
            <span className="schedule-travel muted small">
              ↓ {stop.travel.source === 'route' ? '' : '~'}
              {formatDuration(stop.travel.minutes)}
              {stop.travel.source === 'route' ? ' (saved route)' : ' (estimate)'}
            </span>
          )}
          <span className="schedule-stop">
            <span className="schedule-time">{formatMinutes(stop.start)}</span>
            <span>
              {i + 1}. {stop.place.name}
              <span className="muted small"> · until {formatMinutes(stop.leave)}</span>
              {stop.wait > 0 && <span className="muted small"> · waits {formatDuration(stop.wait)} for opening</span>}
              {stop.late > 0 && <span className="warning small"> · {stop.late} min past closing</span>}
            </span>
          </span>
        </li>
        ),
      )}
    </ol>
  )
}

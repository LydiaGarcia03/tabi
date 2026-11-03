import { useState } from 'react'
import { COUNTRIES, COUNTRY_CURRENCY } from '../data/countries'
import { addDays, formatDay } from '../dates'
import type { Expense, TimeOff, Trip } from '../db/model'
import { updateTrip } from '../db/trips'
import type { WorkHolidays } from '../holidays/holidays'
import { DEFAULT_WORK_DAYS, weekday, type TimeOffCount } from '../planning/timeOff'
import { useTimeOff } from '../planning/useTimeOff'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

// Time off (User's picks from mocks, 2026-11-02): a card in the itinerary's side column (phones: the More tab) with the
// answer (P1); a click opens A2 — the count as a short sum and the calendar of the days away — in a sheet, with its
// settings. The trip's dates also say "· 13 vacation days" (P3's text).

const save = (trip: Trip, patch: Partial<TimeOff>) => updateTrip(trip.id, { timeOff: { ...trip.timeOff, ...patch } })

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export function TimeOffCard({ trip, expenses }: { trip: Trip; expenses: Expense[] }) {
  const [open, setOpen] = useState(false)
  const { count } = useTimeOff(trip, expenses)
  const set = !!trip.timeOff?.country

  return (
    <>
      <button type="button" className="card time-off-card" onClick={() => setOpen(true)}>
        <span className="row between">
          <strong>Time off</strong>
          <Icon name="forward" size={16} />
        </span>
        {!set ? (
          <span className="muted small">How many vacation days the trip takes, with your work calendar's holidays. Set up ›</span>
        ) : count === undefined ? (
          <span className="muted small">Loading your work calendar's holidays (needs the internet once)…</span>
        ) : count === null ? (
          <span className="muted small">Check the dates of leaving and coming back.</span>
        ) : (
          <>
            <span>
              <strong className="time-off-number num">{count.vacation}</strong> {count.vacation === 1 ? 'vacation day' : 'vacation days'}
            </span>
            <span className="muted small">
              {count.daysAway} days away ({formatDay(count.away.leave)} → {formatDay(count.away.back)})
              {trip.timeOff?.approved?.length ? (
                count.toAsk > 0 ? (
                  <>
                    {' · '}
                    <span className="time-off-warn">{count.toAsk} still to ask for</span>
                  </>
                ) : (
                  ' · all in your approved vacation'
                )
              ) : null}
            </span>
            {count.clt && (!count.clt.startOk || count.clt.short) && (
              <span className="small time-off-warn">
                <Icon name="warning" size={14} /> {!count.clt.startOk ? `Can't start on ${formatDay(count.clt.start)} (CLT)` : 'Shorter than 5 days (CLT)'}
              </span>
            )}
          </>
        )}
      </button>
      {open && (
        <Sheet title="Time off" onClose={() => setOpen(false)}>
          <TimeOffSheet trip={trip} expenses={expenses} />
        </Sheet>
      )}
    </>
  )
}

function TimeOffSheet({ trip, expenses }: { trip: Trip; expenses: Expense[] }) {
  const { count, holidays } = useTimeOff(trip, expenses)
  const [settings, setSettings] = useState(!trip.timeOff?.country)

  return (
    <div className="time-off-sheet">
      <div className="row between">
        <span className="muted small">
          {trip.timeOff?.country ? `Work calendar: ${workCalendarName(trip.timeOff, holidays)}` : 'Set your work calendar to start.'}
        </span>
        {trip.timeOff?.country && (
          <button type="button" className="link" onClick={() => setSettings(!settings)}>
            {settings ? 'Done' : 'Settings'}
          </button>
        )}
      </div>
      {settings ? (
        <TimeOffSettings trip={trip} expenses={expenses} holidays={holidays} count={count} onDone={() => setSettings(false)} />
      ) : count === undefined ? (
        <p className="muted small">Loading your work calendar's holidays (needs the internet once)…</p>
      ) : count === null ? (
        <p className="muted small">Coming back can't be before leaving: check the dates in Settings.</p>
      ) : (
        <TimeOffCount count={count} trip={trip} holidays={holidays} />
      )}
    </div>
  )
}

function workCalendarName(timeOff: TimeOff, holidays?: WorkHolidays): string {
  const country = COUNTRIES.find((c) => c.code === timeOff.country)?.name ?? timeOff.country ?? ''
  const region = timeOff.region && holidays?.regions.find(([code]) => code === timeOff.region)?.[1]
  return region ? `${country} · ${region}` : country
}

const SOURCE = { typed: 'typed by you', flight: 'your flight', trip: "the trip's dates" } as const

/** A2: the count as a short sum, then the calendar. */
function TimeOffCount({ count, trip, holidays }: { count: TimeOffCount; trip: Trip; holidays?: WorkHolidays }) {
  const t = trip.timeOff ?? {}
  const workDays = t.workDays ?? DEFAULT_WORK_DAYS
  const weekendsOnly = [0, 6].every((d) => !workDays.includes(d)) && workDays.length === 5
  const restLabel = count.calendarDays ? (weekendsOnly ? 'Weekends before and after' : 'Days off before and after') : weekendsOnly ? 'Weekends' : 'Days off'
  const clt = count.clt
  return (
    <>
      <div className="time-off-receipt">
        <div>
          <span>
            Days away <span className="muted">{formatDay(count.away.leave)} → {formatDay(count.away.back)}</span>
          </span>
          <span className="num">{count.daysAway}</span>
        </div>
        {count.rest > 0 && (
          <div className="muted">
            <span>{restLabel}</span>
            <span className="num">− {count.rest}</span>
          </div>
        )}
        {count.holidays.length > 3 ? (
          <div className="muted">
            <span>Holidays</span>
            <span className="num">− {count.holidays.length}</span>
          </div>
        ) : (
          count.holidays.map((h) => (
            <div key={h.date} className="muted">
              <span>
                {h.name} <span className="small">{formatDay(h.date)}</span>
              </span>
              <span className="num">− 1</span>
            </div>
          ))
        )}
        <div className="total">
          <span>{count.calendarDays ? 'Vacation days (calendar days, CLT)' : 'Vacation days'}</span>
          <span className="num">{count.vacation}</span>
        </div>
        {(t.approved?.length ?? 0) > 0 &&
          (count.toAsk === 0 ? (
            <div className="ok-text">
              <span>All in your approved vacation</span>
              <Icon name="check" size={16} />
            </div>
          ) : (
            <>
              <div className="ok-text">
                <span>In your approved vacation</span>
                <span className="num">{count.covered}</span>
              </div>
              <div className="time-off-warn strong">
                <span>
                  Still to ask for ({formatDay(count.toAskFrom!)}
                  {count.toAskTo !== count.toAskFrom && `–${formatDay(count.toAskTo!)}`})
                </span>
                <span className="num">{count.toAsk}</span>
              </div>
            </>
          ))}
      </div>

      {clt && !clt.startOk && (
        <p className="time-off-alert small">
          <strong>
            <Icon name="warning" size={14} /> Vacation can't start on {formatDay(clt.start)}
          </strong>
          <br />
          Under the CLT it may not start in the 2 days before a holiday or the weekly rest (Sunday).
          {(clt.earlier || clt.later) &&
            ` Start on ${[clt.earlier, clt.later]
              .filter(Boolean)
              .map((d) => formatDay(d!))
              .join(' or ')} instead,`}{' '}
          or confirm with your HR.
        </p>
      )}
      {clt?.short && (
        <p className="time-off-alert small">
          <strong>
            <Icon name="warning" size={14} /> {plural(count.vacation, 'day')} is too short for a vacation period
          </strong>
          <br />
          Under the CLT a period has at least 5 days (and one of the year's at least 14).
        </p>
      )}

      <TimeOffCalendar count={count} holidays={holidays?.dates} />

      <p className="muted small time-off-foot">
        Leaving and coming back:{' '}
        {count.away.leaveFrom === count.away.backFrom
          ? SOURCE[count.away.leaveFrom]
          : `${SOURCE[count.away.leaveFrom]} / ${SOURCE[count.away.backFrom]}`}{' '}
        (Settings to change).
        {count.left != null && ` ${plural(count.left, 'day')} left of your ${t.perYear} this year.`}
        {clt?.startOk && ` ✓ Starting on ${formatDay(clt.start)} is fine under the CLT.`}
      </p>
    </>
  )
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** The months of the days away: vacation days red (green inside your approved vacation), days off blue, holidays dotted. */
function TimeOffCalendar({ count, holidays }: { count: TimeOffCount; holidays?: Map<string, string> }) {
  const byDate = new Map(count.days.map((d) => [d.date, d]))
  const months: string[] = []
  for (let m = count.away.leave.slice(0, 7); m <= count.away.back.slice(0, 7); m = addDays(`${m}-28`, 7).slice(0, 7)) months.push(m)
  return (
    <>
      <div className="time-off-months">
        {months.map((month) => {
          const first = `${month}-01`
          const cells: (string | null)[] = Array.from({ length: weekday(first) }, () => null)
          for (let d = first; d.startsWith(month); d = addDays(d, 1)) cells.push(d)
          return (
            <div key={month} className="time-off-month">
              <h4>
                {MONTHS[Number(month.slice(5)) - 1]} {month.slice(0, 4)}
              </h4>
              <div className="time-off-grid">
                {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                  <span key={i} className="dow">
                    {d}
                  </span>
                ))}
                {cells.map((date, i) => {
                  if (!date) return <span key={i} />
                  const day = byDate.get(date)
                  const holiday = holidays?.get(date)
                  const cls = [
                    'day',
                    day && 'away',
                    day?.kind === 'vacation' && (day.approved ? 'approved' : 'needed'),
                    holiday && 'holiday',
                  ]
                    .filter(Boolean)
                    .join(' ')
                  return (
                    <span key={date} className={cls} title={holiday}>
                      {Number(date.slice(8))}
                    </span>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <div className="time-off-legend small muted">
        <span>
          <i className="needed" /> Vacation day
        </span>
        <span>
          <i className="approved" /> Approved vacation
        </span>
        <span>
          <i className="away" /> Day off away
        </span>
        <span>
          <i className="holiday" /> Holiday
        </span>
      </div>
    </>
  )
}

const WEEK = [1, 2, 3, 4, 5, 6, 0]
const WEEK_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Guess from "my money": BRL → Brazil. */
const guessCountry = (trip: Trip) => Object.entries(COUNTRY_CURRENCY).find(([, currency]) => currency === trip.displayCurrency)?.[0]

function TimeOffSettings({
  trip,
  expenses,
  holidays,
  count,
  onDone,
}: {
  trip: Trip
  expenses: Expense[]
  holidays?: WorkHolidays
  count: TimeOffCount | null | undefined
  onDone: () => void
}) {
  const t = trip.timeOff ?? {}
  const workDays = t.workDays ?? DEFAULT_WORK_DAYS
  const numberOrNone = (value: string) => (value.trim() === '' || !Number.isFinite(Number(value)) ? undefined : Math.max(0, Math.round(Number(value))))
  const approved = t.approved ?? []
  const away = count?.away

  return (
    <div className="time-off-settings">
      <div className="field-stack">
        <span className="field-label">
          Work calendar <span className="muted">· whose holidays you get</span>
        </span>
        <div className="row wrap">
          <select
            aria-label="Country of your work calendar"
            value={t.country ?? ''}
            onChange={(e) => {
              const country = e.target.value || undefined
              void save(trip, { country, region: undefined, ...(country === 'BR' && t.clt == null ? { clt: true } : {}) })
            }}
          >
            <option value="">Choose a country…</option>
            {!t.country && guessCountry(trip) && <option value={guessCountry(trip)}>{COUNTRIES.find((c) => c.code === guessCountry(trip))?.name}</option>}
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          {t.country && holidays && holidays.regions.length > 0 && (
            <select aria-label="Region of your work calendar" value={t.region ?? ''} onChange={(e) => void save(trip, { region: e.target.value || undefined })}>
              <option value="">National holidays only</option>
              {holidays.regions.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </div>
        <span className="muted small">Where your company is: its national and regional holidays don't use vacation days.</span>
      </div>

      <div className="field-stack">
        <span className="field-label">Working days</span>
        <div className="chip-picker time-off-week">
          {WEEK.map((d) => {
            const on = workDays.includes(d)
            return (
              <button
                key={d}
                type="button"
                className={on ? 'active' : undefined}
                aria-pressed={on}
                onClick={() => void save(trip, { workDays: on ? workDays.filter((w) => w !== d) : [...workDays, d].sort() })}
              >
                {WEEK_LABEL[d]}
              </button>
            )
          })}
        </div>
      </div>

      <div className="row wrap time-off-numbers">
        <label>
          Vacation days a year
          <input type="number" min="0" inputMode="numeric" value={t.perYear ?? ''} placeholder="30" onChange={(e) => void save(trip, { perYear: numberOrNone(e.target.value) })} />
        </label>
        <label>
          Used on other things
          <input type="number" min="0" inputMode="numeric" value={t.used ?? ''} placeholder="0" onChange={(e) => void save(trip, { used: numberOrNone(e.target.value) })} />
        </label>
      </div>

      <div className="field-stack">
        <span className="field-label">
          Approved vacation <span className="muted">· optional</span>
        </span>
        {approved.map((period, i) => (
          <div key={i} className="row time-off-period">
            <input
              type="date"
              aria-label="From"
              value={period.from}
              max={period.to}
              onChange={(e) => e.target.value && void save(trip, { approved: approved.map((p, j) => (j === i ? { ...p, from: e.target.value } : p)) })}
            />
            <span aria-hidden="true">→</span>
            <input
              type="date"
              aria-label="To"
              value={period.to}
              min={period.from}
              onChange={(e) => e.target.value && void save(trip, { approved: approved.map((p, j) => (j === i ? { ...p, to: e.target.value } : p)) })}
            />
            <button type="button" className="ghost icon-button" aria-label="Remove this period" onClick={() => void save(trip, { approved: approved.filter((_, j) => j !== i) })}>
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="link"
          onClick={() => {
            const from = away?.leave ?? trip.startDate
            void save(trip, { approved: [...approved, { from, to: away?.back ?? addDays(from, 13) }] })
          }}
        >
          <Icon name="plus" size={14} /> Add a period
        </button>
      </div>

      <div className="field-stack">
        <span className="field-label">
          Away from home <span className="muted">· the flight days count</span>
        </span>
        <div className="row wrap time-off-period">
          <label>
            Leave
            <input type="date" value={away?.leave ?? t.leave ?? ''} onChange={(e) => void save(trip, { leave: e.target.value || undefined })} />
          </label>
          <label>
            Back home
            <input type="date" value={away?.back ?? t.back ?? ''} onChange={(e) => void save(trip, { back: e.target.value || undefined })} />
          </label>
        </div>
        <span className="muted small">
          {t.leave || t.back ? (
            <button type="button" className="link" onClick={() => void save(trip, { leave: undefined, back: undefined })}>
              Use the flights again
            </button>
          ) : expenses.some((e) => e.journey?.mode === 'flight') ? (
            'From your flights from and to home in the itinerary. Changing them here doesn’t change the trip.'
          ) : (
            'The trip’s first and last day until there are flights in the itinerary. Changing them here doesn’t change the trip.'
          )}
        </span>
      </div>

      <label className="time-off-clt">
        <input type="checkbox" checked={!!t.clt} onChange={(e) => void save(trip, { clt: e.target.checked || undefined })} />
        <span>
          <strong>Brazilian labor rules (CLT)</strong>
          <br />
          <span className="muted small">
            Vacation counts in calendar days (weekends and holidays inside it included); warns when it starts in the 2 days
            before a holiday or Sunday, or is shorter than 5 days.
          </span>
        </span>
      </label>

      {t.country && (
        <button type="button" className="primary" onClick={onDone}>
          See the count
        </button>
      )}
    </div>
  )
}

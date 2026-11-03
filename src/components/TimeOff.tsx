import { useMemo, useRef, useState } from 'react'
import { COUNTRIES, COUNTRY_CURRENCY } from '../data/countries'
import { addDays, daysBetween, formatDay } from '../dates'
import type { Expense, TimeOff, Trip, VacationPeriod } from '../db/model'
import { updateTrip } from '../db/trips'
import { useWorkHolidays, type WorkHolidays } from '../holidays/holidays'
import { countTimeOff, DEFAULT_WORK_DAYS, vacationPeriods, weekday, type HomeFlight, type TimeOffCount } from '../planning/timeOff'
import { useTimeOff } from '../planning/useTimeOff'
import { useDismiss } from '../useDismiss'
import { useOnline } from '../useOnline'
import { useMediaQuery } from '../useMediaQuery'
import { PHONE } from '../breakpoints'
import { Icon } from './Icon'
import { InfoTip } from './InfoTip'
import { Sheet } from './Sheet'

// Time off (User's picks from mocks, 2026-11-02): on computers a card in the itinerary's side column with the answer
// (P1), and the trip's dates say "· 13 vacation days" as plain text (P3's text, opens nothing); on phones P3's line
// above the days ("13 vacation days · 20 away · 4 to ask ›"). A click on the card or the line opens A2 — the count as
// a short sum and the calendar of the days away — in a sheet, with its settings.
// Settings and calendar (User's picks from mocks, 2026-11-03): A's lines with icons (work calendar, working days,
// vacation days, CLT) and, in place of typed dates, the calendar of style 1: the trip a solid blue band, the flight days
// there and back a paler blue with a line on top and a round plane where you leave and come back home; vacation marked
// by tapping its first and last day (a green pill), days off that aren't vacation by tapping a day (purple); the
// workdays still to ask for a dashed red pill (S2); the legend behind "Legend ?" (L3).

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Phones (P3): one line above the days; a tap opens the sheet. */
export function TimeOffLine({ trip, expenses }: { trip: Trip; expenses: Expense[] }) {
  const [open, setOpen] = useState(false)
  const { count } = useTimeOff(trip, expenses)
  const set = !!trip.timeOff?.country
  const toAsk = count && vacationPeriods(trip.timeOff).length ? count.toAsk : undefined

  return (
    <>
      <button type="button" className="time-off-line" onClick={() => setOpen(true)}>
        <span>
          {!set ? (
            <>
              <strong className="time-off-accent">Plan your time off</strong> <span className="muted">· Set up</span>
            </>
          ) : !count ? (
            <>
              <strong className="time-off-accent">Time off</strong>{' '}
              <span className="muted">· {count === undefined ? 'loading holidays…' : 'check the dates'}</span>
            </>
          ) : (
            <>
              <strong className="time-off-accent">{plural(count.vacation, 'vacation day')}</strong>{' '}
              <span className="muted">
                · {count.daysAway} away
                {toAsk ? ` · ${toAsk} to ask` : toAsk === 0 ? ' · all approved' : ''}
              </span>
              {count.clt && (!count.clt.startOk || count.clt.short) && (
                <span className="time-off-warn">
                  {' '}
                  <Icon name="warning" size={14} />
                </span>
              )}
            </>
          )}
        </span>
        <Icon name="forward" size={16} />
      </button>
      {open && (
        <Sheet title="Time off" onClose={() => setOpen(false)}>
          <TimeOffSheet trip={trip} expenses={expenses} onClose={() => setOpen(false)} />
        </Sheet>
      )}
    </>
  )
}

/** Computers (P1): a card in the side column; a click opens the sheet. */
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
          <span className="muted small">Plan your time off · Set up ›</span>
        ) : count === undefined ? (
          <span className="muted small">Loading your work calendar's holidays (needs the internet once)…</span>
        ) : count === null ? (
          <span className="muted small">Check the trip's dates.</span>
        ) : (
          <>
            <span>
              <strong className="time-off-number num">{count.vacation}</strong> {count.vacation === 1 ? 'vacation day' : 'vacation days'}
            </span>
            <span className="muted small">
              {count.daysAway} days away ({formatDay(count.away.leave)} → {formatDay(count.away.back)})
              {vacationPeriods(trip.timeOff).length ? (
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
          <TimeOffSheet trip={trip} expenses={expenses} onClose={() => setOpen(false)} />
        </Sheet>
      )}
    </>
  )
}

function TimeOffSheet({ trip, expenses, onClose }: { trip: Trip; expenses: Expense[]; onClose: () => void }) {
  const { count, holidays } = useTimeOff(trip, expenses)
  const [settings, setSettings] = useState(false)

  // Not set up yet: the settings first; cancelling them closes the sheet.
  if (settings || !trip.timeOff?.country)
    return (
      <div className="time-off-sheet">
        <TimeOffSettings trip={trip} expenses={expenses} onDone={() => (trip.timeOff?.country ? setSettings(false) : onClose())} />
      </div>
    )
  return (
    <div className="time-off-sheet">
      <div className="row between">
        <span className="muted small">Work calendar: {workCalendarName(trip.timeOff ?? {}, holidays)}</span>
        <button type="button" className="link" onClick={() => setSettings(true)}>
          Settings
        </button>
      </div>
      {count === undefined ? (
        <p className="muted small">Loading your work calendar's holidays (needs the internet once)…</p>
      ) : count === null ? (
        <p className="muted small">The trip's dates look wrong: check them in Trip settings.</p>
      ) : (
        <TimeOffSum count={count} trip={trip} holidays={holidays} />
      )}
    </div>
  )
}

function workCalendarName(timeOff: TimeOff, holidays?: WorkHolidays): string {
  const country = COUNTRIES.find((c) => c.code === timeOff.country)?.name ?? timeOff.country ?? ''
  const region = timeOff.region && holidays?.regions.find(([code]) => code === timeOff.region)?.[1]
  return region ? `${country} · ${region}` : country
}

/** A2: the count as a short sum, then the calendar. */
function TimeOffSum({ count, trip, holidays }: { count: TimeOffCount; trip: Trip; holidays?: WorkHolidays }) {
  const t = trip.timeOff ?? {}
  const workDays = t.workDays ?? DEFAULT_WORK_DAYS
  const weekendsOnly = [0, 6].every((d) => !workDays.includes(d)) && workDays.length === 5
  const restLabel = count.calendarDays ? (weekendsOnly ? 'Weekends before and after' : 'Days off before and after') : weekendsOnly ? 'Weekends' : 'Days off'
  const clt = count.clt
  const flights = count.away.out || count.away.home
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
        {count.daysOff.length > 0 && (
          <div className="muted">
            <span>
              {count.daysOff.length === 1 ? count.daysOff[0].name || 'Day off' : 'Days off'}{' '}
              <span className="small">{count.daysOff.length === 1 ? formatDay(count.daysOff[0].date) : ''}</span>
            </span>
            <span className="num">− {count.daysOff.length}</span>
          </div>
        )}
        <div className="total">
          <span>{count.calendarDays ? 'Vacation days (calendar days, CLT)' : 'Vacation days'}</span>
          <span className="num">{count.vacation}</span>
        </div>
        {vacationPeriods(t).length > 0 &&
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

      <CltAlerts count={count} />

      <div className="row between away-cal-head">
        <span />
        <CalendarLegend flights={!!flights} />
      </div>
      <AwayCalendar trip={trip} timeOff={t} count={count} holidays={holidays?.dates} />

      <p className="muted small time-off-foot">
        Leaving and coming back: {flights ? 'your flights from and to home' : "the trip's dates, until your flights are in the itinerary"}.
        {clt?.startOk && ` ✓ Starting on ${formatDay(clt.start)} is fine under the CLT.`}
      </p>
    </>
  )
}

function CltAlerts({ count }: { count: TimeOffCount }) {
  const clt = count.clt
  return (
    <>
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
    </>
  )
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

type Marking = 'vacation' | 'dayoff'

interface CalendarEdit {
  mode: Marking
  /** The first day of a vacation being marked, waiting for its last day. */
  pending?: string
  /** The day under the mouse while choosing the last day (the period shown dashed). */
  hover?: string
  /** The first day tapped is in the vacation: the period chosen is taken out of it (shown red). */
  removing?: boolean
  onDay: (date: string) => void
  onHover: (date: string | undefined) => void
}

/**
 * The months away: the trip as a solid blue band, the flight days there and back paler with a line on top (a round
 * plane where you leave home and come back), approved vacation as a green pill, days off as purple circles, the
 * workdays still to ask for as a dashed red pill, holidays as a dot. With `edit`, days are buttons.
 */
function AwayCalendar({ trip, timeOff, count, holidays, edit }: { trip: Trip; timeOff: TimeOff; count: TimeOffCount; holidays?: Map<string, string>; edit?: CalendarEdit }) {
  const { away } = count
  const work = new Set(timeOff.workDays ?? DEFAULT_WORK_DAYS)
  const periods = vacationPeriods(timeOff)
  const daysOff = new Map((timeOff.daysOff ?? []).map((d) => [d.date, d]))
  // The workdays away not in the vacation plan at all (planned but not approved ones are the outlined pill).
  const need = new Set(count.days.filter((d) => d.kind === 'vacation' && !d.planned).map((d) => d.date))
  const inFlight = (date: string, f?: HomeFlight) => !!f && date >= f.leaves && date <= f.lands
  const preview =
    edit?.mode === 'vacation' && edit.pending
      ? edit.hover && edit.hover !== edit.pending
        ? [edit.pending, edit.hover].sort()
        : [edit.pending, edit.pending]
      : undefined

  // Two months at a time (one on phones), from the month you leave home; ‹ › go to any month (User, 2026-11-03).
  const perPage = useMediaQuery(PHONE) ? 1 : 2
  const [firstMonth, setFirstMonth] = useState(away.leave.slice(0, 7))
  const months = Array.from({ length: perPage }, (_, i) => addMonths(firstMonth, i))

  return (
    <div className="away-cal">
      <div className="away-cal-nav">
        <button type="button" className="ghost icon-button" aria-label="Earlier months" onClick={() => setFirstMonth(addMonths(firstMonth, -perPage))}>
          <Icon name="back" size={16} />
        </button>
        <button type="button" className="ghost icon-button" aria-label="Later months" onClick={() => setFirstMonth(addMonths(firstMonth, perPage))}>
          <Icon name="forward" size={16} />
        </button>
      </div>
      {months.map((month) => {
        const start = `${month}-01`
        const cells: (string | null)[] = Array.from({ length: weekday(start) }, () => null)
        for (let d = start; d.startsWith(month); d = addDays(d, 1)) cells.push(d)
        // Always 6 weeks, so the calendar keeps its height when changing months (User, 2026-11-03: what was under
        // it moved up and down).
        while (cells.length < 42) cells.push(null)
        return (
          <div key={month} className="away-month">
            <h4>
              {MONTHS[Number(month.slice(5)) - 1]} {month.slice(0, 4)}
            </h4>
            <div className="away-grid" onMouseLeave={() => edit?.onHover(undefined)}>
              {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
                <span key={i} className="dow">
                  {d}
                </span>
              ))}
              {cells.map((date, i) => {
                if (!date) return <span key={i} className="pad" aria-hidden="true" />
                const isTrip = date >= trip.startDate && date <= trip.endDate
                const isAway = date >= away.leave && date <= away.back
                const period = periods.find((p) => date >= p.from && date <= p.to)
                const asks = need.has(date)
                const inPreview = preview && date >= preview[0] && date <= preview[1]
                const holiday = holidays?.get(date)
                const off = daysOff.get(date)
                const cls = [
                  'day',
                  !work.has(weekday(date)) && 'rest',
                  isTrip && 'trip',
                  isAway && !isTrip && 'fly',
                  (inFlight(date, away.out) || inFlight(date, away.home)) && 'flight',
                  date === away.leave && 'r0',
                  date === away.back && 'r1',
                  !inPreview && period && 'vac',
                  !inPreview && period && !period.approved && 'planned',
                  !inPreview && period?.from === date && 'v0',
                  !inPreview && period?.to === date && 'v1',
                  off && 'off',
                  !inPreview && !period && asks && 'ask',
                  asks && !need.has(addDays(date, -1)) && 'a0',
                  asks && !need.has(addDays(date, 1)) && 'a1',
                  inPreview && 'preview',
                  inPreview && edit?.removing && 'removing',
                  inPreview && date === preview[0] && 'p0',
                  inPreview && date === preview[1] && 'p1',
                ]
                  .filter(Boolean)
                  .join(' ')
                const title = [holiday, off && (off.name || 'Day off')].filter(Boolean).join(' · ') || undefined
                const content = (
                  <>
                    {away.out && date === away.out.leaves && (
                      <span className="plane start" aria-hidden="true">
                        <Icon name="plane" size={10} weight={2.4} />
                      </span>
                    )}
                    {away.home && date === away.home.lands && (
                      <span className="plane end" aria-hidden="true">
                        <Icon name="plane" size={10} weight={2.4} />
                      </span>
                    )}
                    {holiday && <span className="holiday" aria-hidden="true" />}
                    <span className="n">{Number(date.slice(8))}</span>
                  </>
                )
                return edit ? (
                  <button
                    key={date}
                    type="button"
                    className={cls}
                    title={title}
                    aria-label={formatDay(date)}
                    onClick={() => edit.onDay(date)}
                    onMouseEnter={() => edit.onHover(date)}
                  >
                    {content}
                  </button>
                ) : (
                  <span key={date} className={cls} title={title}>
                    {content}
                  </span>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** L3: "Legend ?" opens a bubble over the calendar (hover with a mouse, a tap on touch screens). */
function CalendarLegend({ flights }: { flights: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, open, setOpen)
  return (
    <div ref={ref} className={`away-legend${open ? ' open' : ''}`}>
      <button type="button" className="away-legend-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        Legend <span className="away-legend-q">?</span>
      </button>
      <div className="away-legend-pop" role="tooltip">
        <strong>What the marks mean</strong>
        <span>
          <i className="k trip" /> <b>Trip</b>
        </span>
        {flights && (
          <span>
            <i className="k fly" /> <b>Flight days</b>
          </span>
        )}
        <span>
          <i className="k planned" /> <b>Vacation</b> planned, not approved yet
        </span>
        <span>
          <i className="k vac" /> <b>Vacation</b> approved
        </span>
        <span>
          <i className="k off" /> <b>Day off</b> not vacation
        </span>
        <span>
          <i className="k ask" /> <b>Not in your vacation</b> a workday away
        </span>
        <span>
          <i className="k holiday" /> <b>Holiday</b> of your work calendar
        </span>
        {flights && (
          <span>
            <i className="k plane">
              <Icon name="plane" size={10} weight={2.4} />
            </i>{' '}
            <b>Leave home / back home</b>
          </span>
        )}
      </div>
    </div>
  )
}

const WEEK = [1, 2, 3, 4, 5, 6, 0]
const WEEK_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Guess from "my money": BRL → Brazil. */
const guessCountry = (trip: Trip) => Object.entries(COUNTRY_CURRENCY).find(([, currency]) => currency === trip.displayCurrency)?.[0]

/** "2028-03" + 2 → "2028-05". */
function addMonths(month: string, n: number): string {
  const date = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 + n, 1))
  return date.toISOString().slice(0, 7)
}

/** Consecutive dates as ranges: "Sat 1 → Sun 2 Apr, Thu 6 Apr". */
function ranges(dates: string[]): string {
  const parts: string[][] = []
  for (const d of dates) {
    const last = parts.at(-1)
    if (last && addDays(last.at(-1)!, 1) === d) last.push(d)
    else parts.push([d])
  }
  return parts.map((p) => (p.length === 1 ? formatDay(p[0]) : `${formatDay(p[0])} → ${formatDay(p.at(-1)!)}`)).join(', ')
}

/**
 * N1 (User's choice from a mock, 2026-11-03): a day off's name as its block's main line; "Add a name ✎" when there is
 * none; a tap turns it into an underlined field (no box), Enter or leaving it keeps it, Esc goes back.
 */
function DayOffName({ name, onChange }: { name?: string; onChange: (name: string | undefined) => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(name ?? '')
  if (editing)
    return (
      <input
        className="away-name-input"
        aria-label="Name of the day off"
        placeholder="Bank hours, company day off…"
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          onChange(text.trim() || undefined)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            // Don't close the sheet: only leave the field.
            e.stopPropagation()
            e.preventDefault()
            setText(name ?? '')
            setEditing(false)
          }
        }}
      />
    )
  return (
    <button
      type="button"
      className={`away-name${name ? '' : ' empty'}`}
      onClick={() => {
        setText(name ?? '')
        setEditing(true)
      }}
    >
      {name || 'Add a name'} <Icon name="edit" size={12} />
    </button>
  )
}

/** "São Paulo (GRU)" → "GRU". */
const airport = (place: string) => place.match(/\(([A-Z]{3})\)/)?.[1] ?? place

/** Takes the days from → to out of the vacation periods (a period may split in two, each keeping its approval). */
function removePeriod(periods: VacationPeriod[], from: string, to: string): VacationPeriod[] {
  return periods.flatMap((p) => {
    if (p.to < from || p.from > to) return [p]
    return [p.from < from && { ...p, to: addDays(from, -1) }, p.to > to && { ...p, from: addDays(to, 1) }].filter((q): q is VacationPeriod => !!q)
  })
}

/**
 * Adds a planned (not approved) vacation period. Approved periods stay as they are (the new days around them become
 * periods of their own: they still need approving); the new days merge with the planned periods they touch.
 */
function addPeriod(periods: VacationPeriod[], from: string, to: string): VacationPeriod[] {
  const approved = periods.filter((p) => p.approved)
  let planned = periods.filter((p) => !p.approved)
  // The new days not already approved, as pieces.
  const pieces = approved.reduce<VacationPeriod[]>((left, p) => removePeriod(left, p.from, p.to), [{ from, to }])
  for (const piece of pieces) {
    const merged = { ...piece }
    planned = planned.filter((p) => {
      const touches = p.from <= addDays(merged.to, 1) && p.to >= addDays(merged.from, -1)
      if (touches) {
        if (p.from < merged.from) merged.from = p.from
        if (p.to > merged.to) merged.to = p.to
      }
      return !touches
    })
    planned.push(merged)
  }
  return [...approved, ...planned].sort((a, b) => a.from.localeCompare(b.from))
}

/** A's lines (User's choice from a mock, 2026-11-03), with the calendar to mark vacation and days off; Save / Cancel. */
function TimeOffSettings({ trip, expenses, onDone }: { trip: Trip; expenses: Expense[]; onDone: () => void }) {
  const [draft, setDraft] = useState<TimeOff>(() => {
    // Fields of the first version are dropped on save: typed leave / back, vacation days a year / used (User, 2026-11-03).
    const saved: TimeOff & { leave?: string; back?: string; perYear?: number; used?: number } = { ...trip.timeOff }
    delete saved.leave
    delete saved.back
    delete saved.perYear
    delete saved.used
    const country = saved.country ?? guessCountry(trip)
    return { ...saved, country, clt: saved.clt ?? (country === 'BR' ? true : undefined) }
  })
  const patch = (p: Partial<TimeOff>) => setDraft((d) => ({ ...d, ...p }))
  const online = useOnline()
  const holidays = useWorkHolidays(draft.country, draft.region, online)
  const count = useMemo(() => countTimeOff({ ...trip, timeOff: draft }, expenses, holidays?.dates ?? new Map()), [trip, draft, expenses, holidays])
  const [mode, setMode] = useState<Marking>('vacation')
  const [pending, setPending] = useState<string>()
  const [hover, setHover] = useState<string>()

  const workDays = draft.workDays ?? DEFAULT_WORK_DAYS
  const periods = vacationPeriods(draft)
  const daysOff = draft.daysOff ?? []
  const removing = !!pending && periods.some((p) => pending >= p.from && pending <= p.to)
  const setPeriods = (vacation: VacationPeriod[]) => patch({ vacation, approved: undefined })

  const onDay = (date: string) => {
    if (mode === 'dayoff') {
      patch({ daysOff: daysOff.some((d) => d.date === date) ? daysOff.filter((d) => d.date !== date) : [...daysOff, { date }].sort((a, b) => a.date.localeCompare(b.date)) })
    } else if (!pending) {
      setPending(date)
    } else {
      const [from, to] = [pending, date].sort()
      // Starting on a day already in the vacation takes the chosen days out of it (User, 2026-11-03).
      setPeriods(removing ? removePeriod(periods, from, to) : addPeriod(periods, from, to))
      setPending(undefined)
      setHover(undefined)
    }
  }

  const saveAll = async () => {
    const clean: TimeOff = {
      ...draft,
      vacation: periods.length ? periods.map((p) => (p.approved ? p : { from: p.from, to: p.to })) : undefined,
      approved: undefined,
      daysOff: daysOff.length ? daysOff.map((d) => (d.name?.trim() ? { date: d.date, name: d.name.trim() } : { date: d.date })) : undefined,
    }
    await updateTrip(trip.id, { timeOff: clean })
    onDone()
  }

  const { out, home } = count?.away ?? {}
  const tripDays = daysBetween(trip.startDate, trip.endDate) + 1

  return (
    <div className="time-off-settings">
      <div className="to-line">
        <Icon name="building" size={18} />
        <div className="to-stack">
          <div className="to-pair">
            <select aria-label="Country of your work calendar" value={draft.country ?? ''} onChange={(e) => {
              const country = e.target.value || undefined
              patch({ country, region: undefined, ...(country === 'BR' && draft.clt == null ? { clt: true } : {}) })
            }}>
              <option value="">Choose a country…</option>
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            {draft.country && holidays && holidays.regions.length > 0 && (
              <select aria-label="Region of your work calendar" value={draft.region ?? ''} onChange={(e) => patch({ region: e.target.value || undefined })}>
                <option value="">National holidays only</option>
                {holidays.regions.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            )}
            <InfoTip label="About the work calendar" align="end">
              <span className="tip-lines">
                <span>
                  <strong>Choose where you work,</strong> not where you travel.
                </span>
                <span>A holiday there is a day off anyway, so it doesn’t use a vacation day.</span>
              </span>
            </InfoTip>
          </div>
        </div>
      </div>

      <div className="to-line">
        <Icon name="calendar" size={18} />
        <div className="chip-picker time-off-week" aria-label="Working days">
          {WEEK.map((d) => {
            const on = workDays.includes(d)
            return (
              <button
                key={d}
                type="button"
                className={on ? 'active' : undefined}
                aria-pressed={on}
                onClick={() => patch({ workDays: on ? workDays.filter((w) => w !== d) : [...workDays, d].sort() })}
              >
                {WEEK_LABEL[d]}
              </button>
            )
          })}
        </div>
      </div>

      <div className="to-line">
        <Icon name="done" size={18} />
        <div className="to-stack">
          <div className="row wrap between">
            <div className="segmented" role="radiogroup" aria-label="What a tap marks">
              {(
                [
                  ['vacation', 'Vacation'],
                  ['dayoff', 'Day off'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  className={mode === value ? 'active' : ''}
                  onClick={() => {
                    setMode(value)
                    setPending(undefined)
                  }}
                >
                  <i className={`away-swatch ${value === 'vacation' ? 'vac' : 'off'}`} /> {label}
                </button>
              ))}
            </div>
            <CalendarLegend flights={!!(out || home)} />
          </div>
          <span className="muted small">
            {mode === 'dayoff' ? (
              'Tap the days off that aren’t vacation (a tap again removes one)'
            ) : pending && hover && hover !== pending ? (
              <>
                {/* While choosing (mouse over the last day): how many days the period takes. */}
                <b className={removing ? 'time-off-removing' : undefined}>
                  {removing && 'Take out '}
                  {formatDay([pending, hover].sort()[0])} → {formatDay([pending, hover].sort()[1])} · {plural(Math.abs(daysBetween(pending, hover)) + 1, 'day')}
                </b>{' '}
                · tap to finish{' '}
                <button type="button" className="link" onClick={() => setPending(undefined)}>
                  Cancel
                </button>
              </>
            ) : pending && removing ? (
              <>
                <b className="time-off-removing">Take out from {formatDay(pending)}</b> · 1 day · now tap the <b>last</b> day to take out{' '}
                <button type="button" className="link" onClick={() => setPending(undefined)}>
                  Cancel
                </button>
              </>
            ) : pending ? (
              <>
                Starts <b>{formatDay(pending)}</b> · 1 day · now tap the <b>last</b> day{' '}
                <button type="button" className="link" onClick={() => setPending(undefined)}>
                  Cancel
                </button>
              </>
            ) : (
              <>
                Tap the <b>first</b> and <b>last</b> day of your vacation{' '}
                <InfoTip label="How to change the vacation">
                  Starting on a day already in your vacation takes the days you choose out of it. Each vacation period has an “Approved” box below: until it is
                  ticked, the trip’s checklist has “Get your vacation approved”.
                </InfoTip>
              </>
            )}
          </span>
          {count ? (
            <AwayCalendar trip={trip} timeOff={draft} count={count} holidays={holidays?.dates} edit={{ mode, pending, hover, removing, onDay, onHover: setHover }} />
          ) : (
            <p className="muted small">The trip's dates look wrong: check them in Trip settings.</p>
          )}

          {/* D4 (User's choice from a mock, 2026-11-03): blocks whose left edge has the calendar's color — away (blue),
              each vacation period (green; dashed while not approved) with an "Approved" switch and ✕, each day off
              (purple; N1: its name as the main line, edited in place), the days not covered (dashed red). */}
          {count && (
            <div className="away-blocks">
              <div className="away-block away">
                <span className="away-block-body">
                  <span className="away-block-head">Away · {plural(count.daysAway, 'day')}</span>
                  <span className="away-block-main">
                    {formatDay(count.away.leave)} → {formatDay(count.away.back)}
                  </span>
                  {out || home ? (
                    <span className="away-block-sub">
                      {tripDays} of trip + {plural(count.daysAway - tripDays, 'flight day')}
                    </span>
                  ) : (
                    <span className="away-block-sub">The trip's dates · the flight days are added once your flights are in the itinerary</span>
                  )}
                  {[out, home].map(
                    (f, i) =>
                      f && (
                        <span key={i} className="away-block-sub">
                          {airport(f.from)} → {airport(f.to)} leaves {formatDay(f.leaves)}
                          {f.time && ` ${f.time}`} · lands {formatDay(f.lands)}
                          {f.arriveTime && ` ${f.arriveTime}`}
                        </span>
                      ),
                  )}
                  {(out || home) && !(out && home) && (
                    <span className="away-block-sub">The flight {out ? 'back' : 'there'} is added once it is in the itinerary</span>
                  )}
                </span>
              </div>

              {periods.length === 0 && (
                <div className="away-block vacation planned">
                  <span className="away-block-body">
                    <span className="away-block-head">Vacation</span>
                    <span className="away-block-sub">Not planned yet: tap its first and last day on the calendar</span>
                  </span>
                </div>
              )}
              {periods.map((p) => (
                <div key={p.from} className={`away-block vacation${p.approved ? '' : ' planned'}`}>
                  <span className="away-block-body">
                    <span className="away-block-head">Vacation · {plural(daysBetween(p.from, p.to) + 1, 'day')}</span>
                    <span className="away-block-main">
                      {formatDay(p.from)} → {formatDay(p.to)}
                    </span>
                  </span>
                  <span className="away-block-end">
                    <label className="away-approve" title="Tick it once your company approves this vacation">
                      <input
                        type="checkbox"
                        role="switch"
                        className="toggle"
                        checked={!!p.approved}
                        onChange={(e) => setPeriods(periods.map((q) => (q === p ? { ...q, approved: e.target.checked || undefined } : q)))}
                      />
                      Approved
                    </label>
                    <button type="button" className="ghost icon-button" aria-label="Remove this vacation" onClick={() => setPeriods(periods.filter((q) => q !== p))}>
                      <Icon name="close" size={14} />
                    </button>
                  </span>
                </div>
              ))}

              {daysOff.map((d) => (
                <div key={d.date} className="away-block dayoff">
                  <span className="away-block-body">
                    <span className="away-block-head">Day off · {formatDay(d.date)}</span>
                    <DayOffName name={d.name} onChange={(name) => patch({ daysOff: daysOff.map((x) => (x.date === d.date ? { ...x, name } : x)) })} />
                  </span>
                  <span className="away-block-end">
                    <button type="button" className="ghost icon-button" aria-label="Remove this day off" onClick={() => patch({ daysOff: daysOff.filter((x) => x.date !== d.date) })}>
                      <Icon name="close" size={14} />
                    </button>
                  </span>
                </div>
              ))}

              {count.unplanned > 0 && (
                <div className="away-block gap">
                  <span className="away-block-body">
                    <span className="away-block-head">Not in your vacation · {plural(count.unplanned, 'day')}</span>
                    <span className="away-block-main">{ranges(count.days.filter((d) => d.kind === 'vacation' && !d.planned).map((d) => d.date))}</span>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="to-line center">
        <Icon name="scale" size={18} />
        <div className="row between to-clt">
          <span>
            Brazilian labor rules (CLT){' '}
            <InfoTip label="About the CLT rules">
              Vacation counts in calendar days (weekends and holidays inside it included); warns when it starts in the 2 days before a holiday or Sunday, or is shorter than 5 days.
            </InfoTip>
          </span>
          <input
            type="checkbox"
            role="switch"
            className="toggle"
            aria-label="Brazilian labor rules (CLT)"
            checked={!!draft.clt}
            onChange={(e) => patch({ clt: e.target.checked || undefined })}
          />
        </div>
      </div>

      <div className="row sheet-actions">
        <button type="button" className="primary" disabled={!draft.country} onClick={() => void saveAll()}>
          Save
        </button>
        <button type="button" onClick={onDone}>
          Cancel
        </button>
      </div>
    </div>
  )
}

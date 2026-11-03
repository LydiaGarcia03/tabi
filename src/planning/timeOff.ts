// Time off (User, 2026-11-02): how many vacation days a trip takes, from leaving home to coming back (flight days
// count), with the holidays of the work calendar (the company's country and region: working for a company abroad, its
// holidays are the ones you get). Two ways to count:
// - workdays (most companies, "PTO"): every working day away that isn't a holiday;
// - calendar days (Brazil's CLT, art. 130: "30 dias corridos"): every day from the first day off to the last, weekends
//   and holidays inside included; only those at the ends are free. Plus the CLT checks: vacation may not start in the
//   2 days before a holiday or the weekly rest (Sunday; art. 134 §3), and a period has at least 5 days (§1).

import { addDays, daysBetween } from '../dates'
import type { Expense, TimeOff, Trip } from '../db/model'

export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]

export const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()

export interface AwayDates {
  leave: string
  back: string
  /** Where each came from: typed in Time off, the flights from / to home, or the trip's own dates. */
  leaveFrom: 'typed' | 'flight' | 'trip'
  backFrom: 'typed' | 'flight' | 'trip'
}

/**
 * Leaving and coming back home: typed in Time off, else the flights in the itinerary that leave by the trip's first day
 * (the first one) and on or after its last day (the last one, arriving "+N" days later), else the trip's dates.
 */
export function awayDates(trip: Trip, expenses: Expense[]): AwayDates {
  const flights = expenses
    .filter((e) => !e.dayId && e.journey?.mode === 'flight' && e.journey.date)
    .map((e) => e.journey!)
    .sort((a, b) => a.date!.localeCompare(b.date!))
  const out = flights.find((f) => f.date! <= trip.startDate)
  const home = [...flights].reverse().find((f) => f.date! >= trip.endDate)
  const homeArrives = home && addDays(home.date!, Math.max(0, home.legs?.at(-1)?.arriveDay ?? 0))
  const t = trip.timeOff
  return {
    leave: t?.leave ?? out?.date ?? trip.startDate,
    back: t?.back ?? homeArrives ?? trip.endDate,
    leaveFrom: t?.leave ? 'typed' : out ? 'flight' : 'trip',
    backFrom: t?.back ? 'typed' : homeArrives ? 'flight' : 'trip',
  }
}

export interface AwayDay {
  date: string
  /** A day off anyway (not a working day), a holiday on a working day, or a vacation day. */
  kind: 'rest' | 'holiday' | 'vacation'
  /** Its holiday's name, also when it falls inside the vacation (CLT). */
  holiday?: string
  /** Inside an approved vacation. */
  approved: boolean
}

export interface CltCheck {
  /** The first day of vacation still to ask for. */
  start: string
  /** False: it is in the 2 days before a holiday or Sunday. */
  startOk: boolean
  /** The closest days around it that would be allowed. */
  earlier?: string
  later?: string
  /** The vacation is shorter than the 5 days a period needs. */
  short: boolean
}

export interface TimeOffCount {
  away: AwayDates
  days: AwayDay[]
  daysAway: number
  /** Days off anyway that come off the count (CLT: only those before the first and after the last vacation day). */
  rest: number
  /** Holidays that come off the count, with their names. */
  holidays: { date: string; name: string }[]
  vacation: number
  /** Vacation days inside an approved vacation, and the rest still to ask for (first and last of them). */
  covered: number
  toAsk: number
  toAskFrom?: string
  toAskTo?: string
  /** Vacation days a year − used − this trip (when the year's days are set). */
  left?: number
  calendarDays: boolean
  clt?: CltCheck
}

export function countTimeOff(trip: Trip, expenses: Expense[], holidays: Map<string, string>): TimeOffCount | null {
  const t: TimeOff = trip.timeOff ?? {}
  const away = awayDates(trip, expenses)
  const length = daysBetween(away.leave, away.back) + 1
  if (length <= 0 || length > 400) return null
  const work = new Set(t.workDays ?? DEFAULT_WORK_DAYS)
  const approved = (date: string) => (t.approved ?? []).some((p) => date >= p.from && date <= p.to)

  const days: AwayDay[] = []
  for (let i = 0; i < length; i++) {
    const date = addDays(away.leave, i)
    const holiday = holidays.get(date)
    const kind = !work.has(weekday(date)) ? 'rest' : holiday ? 'holiday' : 'vacation'
    days.push({ date, kind, holiday, approved: approved(date) })
  }

  // CLT: every day from the first vacation day to the last is a vacation day.
  const calendarDays = !!t.clt
  const first = days.findIndex((d) => d.kind === 'vacation')
  const last = days.findLastIndex((d) => d.kind === 'vacation')
  if (calendarDays && first >= 0) for (let i = first; i <= last; i++) days[i].kind = 'vacation'

  const vacationDays = days.filter((d) => d.kind === 'vacation')
  const toAsk = vacationDays.filter((d) => !d.approved)
  const count: TimeOffCount = {
    away,
    days,
    daysAway: length,
    rest: days.filter((d) => d.kind === 'rest').length,
    holidays: days.filter((d) => d.kind === 'holiday').map((d) => ({ date: d.date, name: d.holiday! })),
    vacation: vacationDays.length,
    covered: vacationDays.length - toAsk.length,
    toAsk: toAsk.length,
    toAskFrom: toAsk[0]?.date,
    toAskTo: toAsk.at(-1)?.date,
    left: t.perYear != null ? t.perYear - (t.used ?? 0) - vacationDays.length : undefined,
    calendarDays,
  }

  if (t.clt && toAsk.length) {
    // A day off before which vacation may not start: Sunday (the weekly rest) or a holiday.
    const blocks = (date: string) => weekday(date) === 0 || holidays.has(date)
    const allowed = (date: string) => work.has(weekday(date)) && !holidays.has(date) && !blocks(addDays(date, 1)) && !blocks(addDays(date, 2))
    const start = toAsk[0].date
    const startOk = allowed(start)
    const near = (step: number) => {
      for (let i = 1; i <= 14; i++) if (allowed(addDays(start, step * i))) return addDays(start, step * i)
      return undefined
    }
    count.clt = { start, startOk, earlier: startOk ? undefined : near(-1), later: startOk ? undefined : near(1), short: vacationDays.length < 5 }
  }
  return count
}

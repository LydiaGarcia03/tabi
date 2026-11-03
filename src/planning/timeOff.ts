// Time off (User, 2026-11-02): how many vacation days a trip takes, from leaving home to coming back (flight days
// count), with the holidays of the work calendar (the company's country and region: working for a company abroad, its
// holidays are the ones you get). Two ways to count:
// - workdays (most companies, "PTO"): every working day away that isn't a holiday;
// - calendar days (Brazil's CLT, art. 130: "30 dias corridos"): every day from the first day off to the last, weekends
//   and holidays inside included; only those at the ends are free. Plus the CLT checks: vacation may not start in the
//   2 days before a holiday or the weekly rest (Sunday; art. 134 §3), and a period has at least 5 days (§1).

import { addDays, daysBetween } from '../dates'
import type { Expense, Journey, TimeOff, Trip, VacationPeriod } from '../db/model'

export const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5]

/** The vacation planned (older data: its approved periods, read as approved vacation). */
export function vacationPeriods(t: TimeOff | undefined): VacationPeriod[] {
  return t?.vacation ?? (t?.approved ?? []).map((p) => ({ ...p, approved: true }))
}

export const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay()

/** A flight from or to home: the day it leaves and the day it lands ("+N" of its last flight). */
export interface HomeFlight {
  leaves: string
  lands: string
  from: string
  to: string
  time?: string
  arriveTime?: string
}

export interface AwayDates {
  leave: string
  back: string
  /** The flights there and back in the itinerary, when there are. */
  out?: HomeFlight
  home?: HomeFlight
}

const homeFlight = (j: Journey): HomeFlight => ({
  leaves: j.date!,
  lands: addDays(j.date!, Math.max(0, j.legs?.at(-1)?.arriveDay ?? 0)),
  from: j.from,
  to: j.to,
  time: j.time,
  arriveTime: j.legs?.at(-1)?.arriveTime,
})

/**
 * Leaving and coming back home: the flights in the itinerary that leave by the trip's first day (the first one) and on
 * or after its last day (the last one, landing "+N" days later), else the trip's dates.
 */
export function awayDates(trip: Trip, expenses: Expense[]): AwayDates {
  const flights = expenses
    .filter((e) => !e.dayId && e.journey?.mode === 'flight' && e.journey.date)
    .map((e) => e.journey!)
    .sort((a, b) => a.date!.localeCompare(b.date!))
  const outJourney = flights.find((f) => f.date! <= trip.startDate)
  const homeJourney = [...flights].reverse().find((f) => f.date! >= trip.endDate && f !== outJourney)
  const out = outJourney && homeFlight(outJourney)
  const home = homeJourney && homeFlight(homeJourney)
  return { leave: out?.leaves ?? trip.startDate, back: home ? (home.lands > trip.endDate ? home.lands : trip.endDate) : trip.endDate, out, home }
}

export interface AwayDay {
  date: string
  /** A day off anyway (not a working day), a holiday on a working day, a day off that isn't vacation, or a vacation day. */
  kind: 'rest' | 'holiday' | 'dayoff' | 'vacation'
  /** Its holiday's name, also when it falls inside the vacation (CLT). */
  holiday?: string
  /** Inside a vacation period planned on the calendar, and inside an approved one. */
  planned: boolean
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
  /** Days off that aren't vacation (on working days away), with their names. */
  daysOff: { date: string; name?: string }[]
  vacation: number
  /** Vacation days not in any vacation planned on the calendar. */
  unplanned: number
  /** Vacation days inside an approved vacation, and the rest still to ask for (first and last of them). */
  covered: number
  toAsk: number
  toAskFrom?: string
  toAskTo?: string
  calendarDays: boolean
  /**
   * The vacation planned on the calendar (User, 2026-11-03: the summary has to follow it, not only what the trip
   * needs): its days (calendar days with the CLT, else workdays that aren't holidays; days off left out), how many are
   * approved and how many are still to ask for. Absent while nothing is planned.
   */
  plan?: { days: number; approved: number; toAsk: number }
  clt?: CltCheck
}

/** The vacation days to show: the plan's when there is one, else what the trip needs. */
export const vacationDaysOf = (count: TimeOffCount) => count.plan?.days ?? count.vacation

/** The days still to ask for: the plan's not approved yet, else every day the trip needs. */
export const toAskOf = (count: TimeOffCount) => count.plan?.toAsk ?? count.toAsk

export function countTimeOff(trip: Trip, expenses: Expense[], holidays: Map<string, string>): TimeOffCount | null {
  const t: TimeOff = trip.timeOff ?? {}
  const away = awayDates(trip, expenses)
  const length = daysBetween(away.leave, away.back) + 1
  if (length <= 0 || length > 400) return null
  const work = new Set(t.workDays ?? DEFAULT_WORK_DAYS)
  const periods = vacationPeriods(t)
  const planned = (date: string) => periods.some((p) => date >= p.from && date <= p.to)
  const approved = (date: string) => periods.some((p) => p.approved && date >= p.from && date <= p.to)
  const dayOff = new Map((t.daysOff ?? []).map((d) => [d.date, d]))

  const days: AwayDay[] = []
  for (let i = 0; i < length; i++) {
    const date = addDays(away.leave, i)
    const holiday = holidays.get(date)
    const kind = !work.has(weekday(date)) ? 'rest' : holiday ? 'holiday' : dayOff.has(date) ? 'dayoff' : 'vacation'
    days.push({ date, kind, holiday, planned: planned(date), approved: approved(date) })
  }

  // CLT: every day from the first vacation day to the last is a vacation day. A day off that isn't vacation splits
  // the vacation in two periods, each counted from its first day to its last.
  const calendarDays = !!t.clt
  if (calendarDays) {
    for (let start = 0; start < days.length; ) {
      let end = start
      while (end < days.length && days[end].kind !== 'dayoff') end++
      const part = days.slice(start, end)
      const first = part.findIndex((d) => d.kind === 'vacation')
      const last = part.findLastIndex((d) => d.kind === 'vacation')
      if (first >= 0) for (let i = first; i <= last; i++) part[i].kind = 'vacation'
      start = end + 1
    }
  }

  const vacationDays = days.filter((d) => d.kind === 'vacation')
  const toAsk = vacationDays.filter((d) => !d.approved)
  const count: TimeOffCount = {
    away,
    days,
    daysAway: length,
    rest: days.filter((d) => d.kind === 'rest').length,
    holidays: days.filter((d) => d.kind === 'holiday').map((d) => ({ date: d.date, name: d.holiday! })),
    daysOff: days.filter((d) => d.kind === 'dayoff').map((d) => ({ date: d.date, name: dayOff.get(d.date)?.name })),
    vacation: vacationDays.length,
    unplanned: vacationDays.filter((d) => !d.planned).length,
    covered: vacationDays.length - toAsk.length,
    toAsk: toAsk.length,
    toAskFrom: toAsk[0]?.date,
    toAskTo: toAsk.at(-1)?.date,
    calendarDays,
  }

  // The vacation planned, counted day by day over its whole periods (they may start before the trip and end after it).
  const length0 = (p: VacationPeriod) => {
    let n = 0
    for (let d = p.from; d <= p.to; d = addDays(d, 1)) {
      const workday = work.has(weekday(d)) && !holidays.has(d)
      if (workday && dayOff.has(d)) continue
      if (calendarDays || workday) n++
    }
    return n
  }
  if (periods.length) {
    const lengths = periods.map(length0)
    const days = lengths.reduce((a, b) => a + b, 0)
    const ok = periods.reduce((sum, p, i) => sum + (p.approved ? lengths[i] : 0), 0)
    count.plan = { days, approved: ok, toAsk: days - ok }
  }

  // CLT checks: on the first vacation period not approved yet when there is a plan, else on the days the trip needs.
  const firstToAsk = periods.length ? periods.filter((p) => !p.approved).sort((a, b) => a.from.localeCompare(b.from))[0]?.from : toAsk[0]?.date
  if (t.clt && firstToAsk) {
    // A day off before which vacation may not start: Sunday (the weekly rest) or a holiday.
    const blocks = (date: string) => weekday(date) === 0 || holidays.has(date)
    const allowed = (date: string) => work.has(weekday(date)) && !holidays.has(date) && !blocks(addDays(date, 1)) && !blocks(addDays(date, 2))
    const start = firstToAsk
    const startOk = allowed(start)
    const near = (step: number) => {
      for (let i = 1; i <= 14; i++) if (allowed(addDays(start, step * i))) return addDays(start, step * i)
      return undefined
    }
    const short = periods.length ? periods.some((p) => daysBetween(p.from, p.to) + 1 < 5) : vacationDays.length < 5
    count.clt = { start, startOk, earlier: startOk ? undefined : near(-1), later: startOk ? undefined : near(1), short }
  }
  return count
}

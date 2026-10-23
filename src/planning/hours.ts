// Opening hours as minutes since midnight of the visit day.

import type { OpeningHours, Place, TimeRange } from '../db/model'

export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
export const DEFAULT_VISIT_MINUTES = 60

/** "09:30" → 570. */
export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

/** 570 → "09:30"; past midnight wraps ("25:10" → "01:10"). */
export function formatMinutes(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Weekday of a "YYYY-MM-DD" date, 0 = Sunday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

export interface Interval {
  open: number
  close: number
}

/** The day's opening intervals, earliest first. */
export type Window = Interval[] | 'closed' | 'unknown'

/** When the place can be visited on that weekday. */
export function windowFor(hours: OpeningHours | undefined, weekday: number): Window {
  if (!hours) return 'unknown'
  const ranges = hours.days[weekday]
  if (ranges === undefined) return 'unknown'
  if (ranges === null || ranges.length === 0) return 'closed'
  return ranges.map(rangeMinutes).sort((a, b) => a.open - b.open)
}

/** Open 24 hours: stored as one range that opens and closes at midnight. */
export const ALL_DAY: TimeRange = { open: '00:00', close: '00:00' }

/** A range that closes when it opens (a full turn of the clock) means open all day. */
export function isAllDay(ranges: TimeRange[] | null | undefined): boolean {
  return !!ranges?.some((r) => r.open === r.close)
}

export function rangeMinutes(range: TimeRange): Interval {
  // Never closes: no visit can run late.
  if (range.open === range.close) return { open: 0, close: Infinity }
  const open = toMinutes(range.open)
  let close = toMinutes(range.close)
  if (close <= open) close += 1440 // Ends after midnight ("00:00" = midnight).
  return { open, close }
}

/** "09:00–17:00", "11:00–13:00, 18:00–22:00", "Open 24 hours", "Closed" or "" when unknown. */
export function describeWindow(window: Window): string {
  if (window === 'unknown') return ''
  if (window === 'closed') return 'Closed'
  if (window.some((i) => i.close === Infinity)) return 'Open 24 hours'
  return window.map((i) => `${formatMinutes(i.open)}–${formatMinutes(i.close)}`).join(', ')
}

/**
 * The whole week in one line, Monday first, alike days grouped:
 * "11:00–13:00, 18:00–22:00 · Closed Mon", "Mon–Fri 09:00–17:00; Sat–Sun 10:00–18:00".
 */
export function describeWeek(hours: OpeningHours): string {
  const groups: { days: number[]; text: string }[] = []
  for (const d of [1, 2, 3, 4, 5, 6, 0]) {
    const window = windowFor(hours, d)
    const text = window === 'closed' || window === 'unknown' ? '' : describeWindow(window)
    const last = groups[groups.length - 1]
    if (last && last.text === text) last.days.push(d)
    else groups.push({ days: [d], text })
  }
  const label = (days: number[]) => (days.length === 1 ? WEEKDAYS[days[0]] : `${WEEKDAYS[days[0]]}–${WEEKDAYS[days[days.length - 1]]}`)
  const open = groups.filter((g) => g.text)
  const closed = groups.filter((g) => !g.text)
  const texts = new Set(open.map((g) => g.text))
  // After a day name: "Sat–Sun 24 hours".
  const short = (text: string) => (text === 'Open 24 hours' ? '24 hours' : text)
  // The same hours on every open day: no need to name the days.
  const openText = texts.size === 1 ? [...texts][0] : open.map((g) => `${label(g.days)} ${short(g.text)}`).join('; ')
  const closedText = closed.length ? `Closed ${closed.map((g) => label(g.days)).join(', ')}` : ''
  return [openText, closedText].filter(Boolean).join(' · ')
}

/**
 * When a visit arriving at `arrive` starts, and how many of its minutes fall
 * outside the opening hours: the earliest interval the whole visit fits in,
 * else the one it overruns least.
 */
export function fitVisit(window: Interval[], arrive: number, duration: number): { start: number; late: number } {
  let best = { start: arrive, late: Infinity }
  for (const interval of window) {
    const start = Math.max(arrive, interval.open)
    const late = Math.max(0, start + duration - interval.close)
    if (late < best.late) best = { start, late }
  }
  return best
}

export function visitMinutes(place: Place): number {
  return place.visitMinutes ?? DEFAULT_VISIT_MINUTES
}

/**
 * Problem with visiting at a planned time, or null if fine (or unknown).
 * E.g. "Closed on Mon", "Opens at 10:00", "Closes at 17:00", "Reopens at 18:00".
 */
export function timeConflict(place: Place, date: string): string | null {
  const weekday = weekdayOf(date)
  const window = windowFor(place.openingHours, weekday)
  if (window === 'closed') return `Closed on ${WEEKDAYS[weekday]}`
  if (window === 'unknown' || !place.plannedTime) return null
  const arrive = toMinutes(place.plannedTime)
  const current = window.find((i) => i.open <= arrive && arrive < i.close)
  if (current) return arrive + visitMinutes(place) > current.close ? `Closes at ${formatMinutes(current.close)}` : null
  const next = window.find((i) => i.open > arrive)
  if (next) return next === window[0] ? `Opens at ${formatMinutes(next.open)}` : `Reopens at ${formatMinutes(next.open)}`
  return `Closed at ${formatMinutes(Math.max(...window.map((i) => i.close)))}`
}

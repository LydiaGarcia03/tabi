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

export type Window = { open: number; close: number } | 'closed' | 'unknown'

/** When the place can be visited on that weekday. */
export function windowFor(hours: OpeningHours | undefined, weekday: number): Window {
  if (!hours) return 'unknown'
  const range = hours.days[weekday]
  if (range === undefined) return 'unknown'
  if (range === null) return 'closed'
  return rangeMinutes(range)
}

export function rangeMinutes(range: TimeRange): { open: number; close: number } {
  const open = toMinutes(range.open)
  let close = toMinutes(range.close)
  if (close <= open) close += 1440 // Ends after midnight ("00:00" = midnight).
  return { open, close }
}

/** "09:00–17:00", "Closed" or "" when unknown. */
export function describeWindow(window: Window): string {
  if (window === 'unknown') return ''
  if (window === 'closed') return 'Closed'
  return `${formatMinutes(window.open)}–${formatMinutes(window.close)}`
}

export function visitMinutes(place: Place): number {
  return place.visitMinutes ?? DEFAULT_VISIT_MINUTES
}

/**
 * Problem with visiting at a planned time, or null if fine (or unknown).
 * E.g. "Closed on Mondays", "Opens at 10:00", "Closes at 17:00".
 */
export function timeConflict(place: Place, date: string): string | null {
  const weekday = weekdayOf(date)
  const window = windowFor(place.openingHours, weekday)
  if (window === 'closed') return `Closed on ${WEEKDAYS[weekday]}`
  if (window === 'unknown' || !place.plannedTime) return null
  const arrive = toMinutes(place.plannedTime)
  if (arrive < window.open) return `Opens at ${formatMinutes(window.open)}`
  if (arrive + visitMinutes(place) > window.close) {
    return arrive >= window.close ? `Closed at ${formatMinutes(window.close)}` : `Closes at ${formatMinutes(window.close)}`
  }
  return null
}

// A late way back to the hotel (User's choice 4-B from a mock, 2026-10-31): most trains in Japan stop between 23:30
// and 00:30, and missing the last one means a costly taxi. Route times are the providers' estimates (no real last-train
// timetable), so the rule is simple: a ride (train, subway, bus, shinkansen, ferry) leaving after 23:00, or one
// arriving after midnight, is worth a word on the "Back to base" row.

import type { Segment } from '../db/model'

const RIDES = new Set<Segment['mode']>(['train', 'subway', 'bus', 'shinkansen', 'ferry'])
const LATE_FROM = 23 * 60

export interface LateRide {
  /** "23:15": when the late ride leaves. */
  leaves: string
  /** It (or the way) ends after midnight. */
  afterMidnight: boolean
}

/** Wall-clock date and minutes of an ISO time at a UTC offset in minutes. */
function local(iso: string, offset: number): { date: string; minutes: number } | null {
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return null
  const shifted = new Date(time + offset * 60_000)
  return { date: shifted.toISOString().slice(0, 10), minutes: shifted.getUTCHours() * 60 + shifted.getUTCMinutes() }
}

const clock = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`

/** "+09:00" → 540. */
function offsetMinutes(offset: string): number {
  const match = offset.match(/([+-])(\d{2}):(\d{2})/)
  return match ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : 0
}

/** The first late ride of a way on a day (`offset` = the place's UTC offset, "+09:00"), or null. */
export function lateRide(segments: Segment[] | undefined, date: string, offset: string): LateRide | null {
  const minutes = offsetMinutes(offset)
  for (const s of segments ?? []) {
    if (!RIDES.has(s.mode) || !s.departureTime) continue
    const leaves = local(s.departureTime, minutes)
    if (!leaves) continue
    const arrives = s.arrivalTime ? local(s.arrivalTime, minutes) : null
    const afterMidnight = leaves.date > date || (arrives != null && arrives.date > date)
    if (afterMidnight || (leaves.date === date && leaves.minutes >= LATE_FROM)) return { leaves: clock(leaves.minutes), afterMidnight }
  }
  return null
}

// "Use my flight": a flight booked in the trip (or kept as a transport
// option) becomes steps of a day's leg, e.g. hotel → Itami → ✈ → Naha.

import { addDays } from '../dates'
import { airport } from '../data/flightNetwork'
import type { Expense, Journey, Segment } from '../db/model'
import type { LatLng, Money } from '../routing/types'
import { airportCode } from './journeys'

export interface FlightSource {
  kind: 'booking' | 'option'
  id: string
  journey: Journey
  price?: Money
}

/**
 * Flights that can be used on a day: the booked ones leaving that date. Options
 * not booked are left out (User's choice, 2026-10-26: a flight shows in the
 * itinerary only once it's booked, like in Cities and on the day cards).
 */
export function flightSources(expenses: Expense[], date: string): FlightSource[] {
  return expenses
    .filter((e) => e.journey?.mode === 'flight' && e.journey.date === date)
    .map((e): FlightSource => ({ kind: 'booking', id: e.id, journey: e.journey!, price: e.amount }))
}

/** "ITM → OKA" (codes when known, else the names). */
export function flightRoute(journey: Journey): string {
  const short = (name: string) => /\(([A-Z0-9]{3,4})\)/.exec(name)?.[1] ?? name
  return `${short(journey.from)} → ${short(journey.to)}`
}

/** "JAL" from "JAL (Japan Airlines)". */
function shortCarrier(carrier: string | undefined): string | undefined {
  return carrier?.replace(/\s*\(.*\)\s*$/, '').trim() || undefined
}

function coordOf(name: string): LatLng | undefined {
  const a = airport(airportCode(name))
  return a && { lat: a.lat, lng: a.lng }
}

/** Local "HH:mm" on the journey's date (+ days) as the ISO time the timeline shows (wall-clock time, like the other steps). */
function isoAt(date: string | undefined, time: string | undefined, days = 0): string | undefined {
  if (!date || !time) return undefined
  return `${addDays(date, days)}T${time}:00+09:00`
}

/** Adds minutes to an ISO time, only within Japan (local times elsewhere are in other zones). */
function plusMinutes(iso: string | undefined, minutes: number | undefined, sameZone: boolean): string | undefined {
  if (!iso || minutes == null || !sameZone) return undefined
  const date = new Date(new Date(iso).getTime() + minutes * 60_000 + 9 * 3_600_000)
  return `${date.toISOString().slice(0, 19)}+09:00`
}

/**
 * The flight steps of a journey: one per flight (connections included), with
 * the times, numbers and class typed in the booking/option, and a straight
 * line from airport to airport when the airports are known.
 */
export function flightSegments(source: FlightSource, ids?: string[]): Segment[] {
  const j = source.journey
  const flights = j.legs?.length
    ? j.legs.map((leg) => ({ ...leg, departDay: leg.departDay ?? 0, arriveDay: leg.arriveDay ?? 0 }))
    : [{ from: j.from, to: j.to, departTime: j.time, arriveTime: undefined, departDay: 0, arriveDay: 0, minutes: j.durationHours != null ? Math.round(j.durationHours * 60) : undefined, carrier: j.carrier, number: j.number }]
  return flights.map((f, i) => {
    const fromCoord = coordOf(f.from)
    const toCoord = coordOf(f.to)
    const inJapan = airport(airportCode(f.from))?.country === 'JP' && airport(airportCode(f.to))?.country === 'JP'
    const departureTime = isoAt(j.date, f.departTime, f.departDay)
    const carrier = shortCarrier(f.carrier ?? j.carrier)
    return {
      id: ids?.[i] ?? crypto.randomUUID(),
      mode: 'flight',
      lineName: [carrier, f.number].filter(Boolean).join(' ') || undefined,
      operator: f.carrier ?? j.carrier,
      service: j.cabin,
      fromName: f.from,
      toName: f.to,
      fromCoord,
      toCoord,
      departureTime,
      arrivalTime: isoAt(j.date, f.arriveTime, f.arriveDay) ?? plusMinutes(departureTime, f.minutes, inJapan),
      durationMinutes: f.minutes,
      path: fromCoord && toCoord ? [fromCoord, toCoord] : [],
      // The price is shown once, on the first flight.
      booking: { kind: source.kind, id: source.id, price: i === 0 ? source.price : undefined },
    }
  })
}

/**
 * The leg's flight steps refreshed from their booking/option (times or
 * number typed later), or null when nothing changed or the source is gone.
 */
export function refreshFlightSteps(segments: Segment[], sources: FlightSource[]): Segment[] | null {
  let changed = false
  const out: Segment[] = []
  for (let i = 0; i < segments.length; i++) {
    const s = segments[i]
    const source = s.mode === 'flight' && s.booking && sources.find((f) => f.kind === s.booking!.kind && f.id === s.booking!.id)
    if (!source) {
      out.push(s)
      continue
    }
    // The run of steps from the same source is replaced as a whole.
    let end = i
    while (end + 1 < segments.length && segments[end + 1].booking?.id === s.booking!.id) end++
    const old = segments.slice(i, end + 1)
    const fresh = flightSegments(source, old.map((o) => o.id)).map((f, k) => ({ ...f, notes: old[k]?.notes, color: old[k]?.color }))
    if (JSON.stringify(fresh) !== JSON.stringify(old)) changed = true
    out.push(...fresh)
    i = end
  }
  return changed ? out : null
}

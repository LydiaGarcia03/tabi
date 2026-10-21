import { findAirline } from '../data/airlines'
import type { Expense, Journey, JourneyLeg, JourneyMode } from '../db/model'
import type { Stay } from '../db/model'

export const JOURNEY_MODES: JourneyMode[] = ['flight', 'shinkansen', 'train', 'bus', 'ferry', 'car']

export const JOURNEY_ICON: Record<JourneyMode, string> = {
  flight: '✈️',
  shinkansen: '🚅',
  train: '🚆',
  bus: '🚌',
  ferry: '⛴️',
  car: '🚗',
}

export const JOURNEY_LABEL: Record<JourneyMode, string> = {
  flight: 'Flight',
  shinkansen: 'Shinkansen',
  train: 'Train',
  bus: 'Bus',
  ferry: 'Ferry',
  car: 'Car',
}

/** Suggestions for the class field. */
export const CABIN_HINTS: Record<JourneyMode, string[]> = {
  flight: ['Economy', 'Premium economy', 'Business'],
  shinkansen: ['Ordinary (reserved)', 'Ordinary (non-reserved)', 'Green Car', 'Gran Class'],
  train: ['Reserved', 'Non-reserved', 'Green Car'],
  bus: ['Standard', 'Premium'],
  ferry: ['Second class', 'First class'],
  car: [],
}

const text = (s: string | undefined) => s?.trim() || undefined

/** Trims text fields, drops empty ones and fills the summary from the legs. */
export function cleanJourney(journey: Journey): Journey {
  const legs = journey.legs?.map((leg) => ({
    ...leg,
    from: leg.from.trim(),
    to: leg.to.trim(),
    carrier: text(leg.carrier),
    number: text(leg.number),
    aircraft: text(leg.aircraft),
  }))
  return withLegSummary({
    ...journey,
    from: journey.from.trim(),
    to: journey.to.trim(),
    carrier: text(journey.carrier),
    number: text(journey.number),
    cabin: text(journey.cabin),
    fare: text(journey.fare),
    stops: text(journey.stops),
    legs: legs && legs.length > 0 ? legs : undefined,
  })
}

/**
 * With legs, the journey's route, departure time, numbers, connections and
 * total time come from them, so lists, the budget and the comparison keep
 * working unchanged. The main airline defaults to the one flown longest.
 */
export function withLegSummary(journey: Journey): Journey {
  const legs = journey.legs
  if (!legs || legs.length === 0) return journey
  const first = legs[0]
  const last = legs[legs.length - 1]
  const carriers = journeyCarriers(journey)
  const total = totalMinutes(journey)
  const via = legs.slice(1).map((l, i) => l.from || legs[i].to).filter(Boolean)
  const connections = legs.length - 1
  return {
    ...journey,
    from: first.from,
    to: last.to,
    time: first.departTime,
    carrier: journey.carrier && carriers.includes(journey.carrier) ? journey.carrier : mainCarrier(legs),
    number: legs.map((l) => l.number).filter(Boolean).join(' + ') || undefined,
    stops:
      connections === 0
        ? 'Direct'
        : via.length === connections
          ? `via ${via.join(', ')}`
          : `${connections} ${connections === 1 ? 'connection' : 'connections'}`,
    durationHours: total == null ? journey.durationHours : Math.round((total / 60) * 100) / 100,
  }
}

/**
 * Best guess of the airline whose checked baggage applies on one ticket: the
 * one flown longest; without flight times, the one with the most flights,
 * then an international airline from the guide.
 */
function mainCarrier(legs: JourneyLeg[]): string | undefined {
  const time = new Map<string, number>()
  const count = new Map<string, number>()
  for (const leg of legs) {
    if (!leg.carrier) continue
    time.set(leg.carrier, (time.get(leg.carrier) ?? 0) + (leg.minutes ?? 0))
    count.set(leg.carrier, (count.get(leg.carrier) ?? 0) + 1)
  }
  const score = (c: string) => [time.get(c)!, count.get(c)!, findAirline(c, 'international') ? 1 : 0]
  return [...time.keys()].sort((a, b) => {
    const [sa, sb] = [score(a), score(b)]
    return sb[0] - sa[0] || sb[1] - sa[1] || sb[2] - sa[2]
  })[0]
}

/** Splits a direct journey into two legs (the connection is filled in by the user). */
export function splitIntoLegs(journey: Journey): Journey {
  return {
    ...journey,
    legs: [
      { from: journey.from, to: '', departTime: journey.time, carrier: journey.carrier, number: journey.number },
      { from: '', to: journey.to, carrier: journey.carrier },
    ],
  }
}

/** Back to a direct journey from its only remaining leg. */
export function mergeLeg(journey: Journey, leg: JourneyLeg): Journey {
  return {
    ...journey,
    legs: undefined,
    stops: undefined,
    from: leg.from,
    to: leg.to,
    time: leg.departTime,
    carrier: leg.carrier,
    number: leg.number,
    durationHours: leg.minutes != null ? leg.minutes / 60 : journey.durationHours,
  }
}

/** Every airline (or operator) of the journey, in order, without repeats. */
export function journeyCarriers(journey: Journey): string[] {
  const names = journey.legs?.length ? journey.legs.map((l) => l.carrier) : [journey.carrier]
  return [...new Set(names.filter((n): n is string => !!n))]
}

/** "GRU" from "São Paulo (GRU)"; otherwise the name itself, normalized. */
export function airportCode(name: string): string {
  return /\(([A-Z0-9]{3,4})\)/.exec(name)?.[1] ?? name.trim().toLowerCase()
}

export interface Connection {
  /** Where the connection happens (arrival airport of the previous leg). */
  at: string
  /** Time on the ground between the two legs; absent when a time is missing. */
  minutes?: number
  /** Arriving at one airport and leaving from another (e.g. GRU → CGH). */
  changesAirport: boolean
  /** The two legs are flown by different airlines. */
  changesCarrier: boolean
}

/** Below this, a connection is tight (security, gate changes, delays). */
export const TIGHT_CONNECTION_MINUTES = 90
/** From this on, a layover is long (Google Flights flags them too). */
export const LONG_LAYOVER_MINUTES = 6 * 60

/** The connections between consecutive legs. */
export function journeyConnections(journey: Journey): Connection[] {
  const legs = journey.legs ?? []
  return legs.slice(1).map((next, i) => {
    const prev = legs[i]
    const arrive = minuteOfTrip(prev.arriveTime, prev.arriveDay)
    const depart = minuteOfTrip(next.departTime, next.departDay)
    return {
      at: prev.to || next.from,
      minutes: arrive != null && depart != null ? depart - arrive : undefined,
      changesAirport: !!prev.to && !!next.from && airportCode(prev.to) !== airportCode(next.from),
      changesCarrier: !!prev.carrier && !!next.carrier && prev.carrier.toLowerCase() !== next.carrier.toLowerCase(),
    }
  })
}

/** Time on board plus layovers, when every piece is known. */
export function totalMinutes(journey: Journey): number | undefined {
  const legs = journey.legs ?? []
  const connections = journeyConnections(journey)
  if (legs.length === 0 || legs.some((l) => l.minutes == null) || connections.some((c) => c.minutes == null || c.minutes < 0)) {
    return undefined
  }
  return legs.reduce((sum, l) => sum + l.minutes!, 0) + connections.reduce((sum, c) => sum + c.minutes!, 0)
}

/** Minutes since midnight of the journey's date: "01:55" on day +1 → 1555. */
function minuteOfTrip(time: string | undefined, day = 0): number | undefined {
  if (!time) return undefined
  const [h, m] = time.split(':').map(Number)
  return day * 24 * 60 + h * 60 + m
}

/** "13 h 45 min" */
export function formatDuration(minutes: number): string {
  return formatHours(minutes / 60)
}

/** "✈️ Navegantes → Osaka" */
export function journeyTitle(journey: Journey): string {
  return `${JOURNEY_ICON[journey.mode]} ${journey.from} → ${journey.to}`
}

export function journeyDetails(journey: Journey): string[] {
  return [
    [journeyCarriers(journey).join(' + '), journey.number].filter(Boolean).join(' '),
    journey.cabin,
    journey.fare && `${journey.fare} fare`,
    journey.stops,
    journey.durationHours != null ? `${formatHours(journey.durationHours)}` : '',
  ].filter((s): s is string => !!s)
}

export function formatHours(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return m ? `${h} h ${m} min` : `${h} h`
}

/** Same city name, ignoring case, spaces and airport codes in parentheses. */
function sameCity(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').trim()
  return norm(a).includes(norm(b)) || norm(b).includes(norm(a))
}

/**
 * Booked journeys (or transport options) on a route. A missing end matches
 * anything that isn't one of the trip's cities (e.g. arriving from home).
 */
export function journeysOnRoute<T extends { journey?: Journey }>(items: T[], stays: Stay[], from?: string, to?: string): T[] {
  const isTripCity = (name: string) => stays.some((s) => sameCity(name, s.city))
  const matches = (name: string, city: string | undefined) => (city ? sameCity(name, city) : !isTripCity(name))
  return items.filter((e) => e.journey && matches(e.journey.from, from) && matches(e.journey.to, to))
}

/** Booked journeys leaving on a given date. */
export function journeysOn(expenses: Expense[], date: string): Expense[] {
  return expenses.filter((e) => e.journey?.date === date)
}

// Flight planner: builds the possible itineraries between two airports with
// the airlines and connections you accept, from the route network in
// src/data/flightNetwork.ts, and scores them on what is known without a
// flight API: baggage (alike and generous), estimated time, connections and
// comfort. Prices and schedules are checked on Google Flights.

import { findAirline, type AirlineInfo } from '../data/airlines'
import { airport, airportDistanceKm, airportLabel, BRAZIL_FEEDER_HUBS, LONG_HAUL_ROUTES } from '../data/flightNetwork'
import type { Journey } from '../db/model'
import { tripBaggage, type TripBaggage } from './baggage'

export interface PlannerInput {
  from: string[]
  to: string[]
  /** Airline names (as in the guide). */
  airlines: string[]
  /** Connection airports accepted abroad (empty = any). Brazilian airports are always accepted. */
  connections: string[]
  checkedBags: number
}

export interface FlightSegment {
  from: string
  to: string
  airline: string
  hours: number
  /** Other airlines flying this same flight (domestic Brazilian ones), worth comparing. */
  alternatives?: string[]
}

export type Priority = 'balanced' | 'baggage' | 'fastest' | 'comfort'

export interface FlightPlan {
  key: string
  segments: FlightSegment[]
  /** Flights plus connections, estimated. */
  hours: number
  connections: number
  baggage: TripBaggage
  /** 0–1 */
  comfort: number
  /** Different airlines outside one alliance: likely separate tickets. */
  separateTickets: boolean
  scores: Record<'baggage' | 'time' | 'connections' | 'comfort', number>
  score: number
}

interface Edge {
  from: string
  to: string
  airline: string
  feeder: boolean
}

/** Average speed with taxiing and climbs, plus a margin per flight. */
const flightHours = (from: string, to: string) => (airportDistanceKm(from, to) ?? 0) / 820 + 0.6
/** Time between flights: shorter on the same airline (one ticket, bags through). */
const layoverHours = (sameAirline: boolean) => (sameAirline ? 2.5 : 3.5)

function edges(airlines: string[]): Edge[] {
  const accepted = new Set(airlines)
  const list: Edge[] = []
  for (const [airline, routes] of Object.entries(LONG_HAUL_ROUTES)) {
    if (!accepted.has(airline)) continue
    for (const [a, b] of routes) list.push({ from: a, to: b, airline, feeder: false }, { from: b, to: a, airline, feeder: false })
  }
  const brazil = (code: string) => airport(code)?.country === 'BR'
  for (const [airline, hubs] of Object.entries(BRAZIL_FEEDER_HUBS)) {
    if (!accepted.has(airline)) continue
    for (const hub of hubs) {
      for (const other of ['NVT', 'FLN', 'JOI', 'CWB', 'POA', 'GRU', 'GIG', 'VCP', 'BSB', 'CNF', 'SSA', 'REC', 'FOR'].filter((c) => c !== hub && brazil(c))) {
        list.push({ from: other, to: hub, airline, feeder: true }, { from: hub, to: other, airline, feeder: true })
      }
    }
  }
  return list
}

/** All itineraries of up to 3 flights, best first for the chosen priority. */
export function planFlights(input: PlannerInput, priority: Priority): FlightPlan[] {
  const all = edges(input.airlines)
  const targets = new Set(input.to)
  const acceptedAbroad = new Set(input.connections)
  const canConnectAt = (code: string) => airport(code)?.country === 'BR' || acceptedAbroad.size === 0 || acceptedAbroad.has(code)
  const found: Edge[][] = []

  const walk = (at: string, path: Edge[]) => {
    if (path.length > 0 && targets.has(at)) {
      found.push(path)
      return
    }
    if (path.length === 3) return
    for (const e of all) {
      if (e.from !== at) continue
      if (path.some((p) => p.from === e.to) || input.from.includes(e.to)) continue
      // A domestic Brazilian flight only at the start or the end of the trip.
      if (e.feeder && path.length > 0 && !path.every((p) => p.feeder) && !targets.has(e.to)) continue
      if (path.length > 0 && !canConnectAt(at)) continue
      walk(e.to, [...path, e])
    }
  }
  input.from.forEach((code) => walk(code, []))

  // A Brazilian flight to reach an airport the long-haul airline already flies from is a detour.
  const longHaulFrom = (airline: string, code: string) => (LONG_HAUL_ROUTES[airline] ?? []).some(([a, b]) => a === code || b === code)
  const plans = found
    // Two Brazilian flights in a row (NVT → GRU → GIG) is never the way to Japan.
    .filter((path) => path.filter((e) => e.feeder).length <= 1)
    .filter((path) => {
      const [first, second] = [path[0], path[1]]
      const [last, beforeLast] = [path.at(-1)!, path.at(-2)]
      if (first.feeder && second && longHaulFrom(second.airline, first.from)) return false
      if (last.feeder && beforeLast && longHaulFrom(beforeLast.airline, last.to)) return false
      return true
    })
    .map((path) => toPlan(path, input.checkedBags))
  const unique = [...new Map(plans.map((p) => [p.key, p])).values()]
  return mergeFeeders(score(unique, priority))
}

/**
 * The same route with a different Brazilian airline for the domestic flight
 * (LATAM or GOL to São Paulo) is one plan: the best scored stays, the others
 * are listed as alternatives on that flight.
 */
function mergeFeeders(plans: FlightPlan[]): FlightPlan[] {
  const byRoute = new Map<string, FlightPlan>()
  for (const plan of plans) {
    const route = plan.segments.map((s) => `${s.from}-${BRAZIL_FEEDER_HUBS[s.airline] ? '*' : s.airline}-${s.to}`).join('|')
    const kept = byRoute.get(route)
    if (!kept) {
      byRoute.set(route, plan)
      continue
    }
    plan.segments.forEach((s, i) => {
      const k = kept.segments[i]
      if (s.airline !== k.airline && !k.alternatives?.includes(s.airline)) k.alternatives = [...(k.alternatives ?? []), s.airline]
    })
  }
  return [...byRoute.values()]
}

function toPlan(path: Edge[], checkedBags: number): FlightPlan {
  const segments = path.map((e) => ({ from: e.from, to: e.to, airline: e.airline, hours: flightHours(e.from, e.to) }))
  const layovers = segments.slice(1).reduce((sum, s, i) => sum + layoverHours(s.airline === segments[i].airline), 0)
  const hours = segments.reduce((sum, s) => sum + s.hours, 0) + layovers
  // Checked bags follow the long-haul airline on one ticket.
  const main = path.find((e) => !e.feeder)?.airline
  const baggage = tripBaggage(
    segments.map((s) => s.airline),
    { main, checkedBags },
  )
  const infos = [...new Set(segments.map((s) => s.airline))].map((n) => findAirline(n)).filter((a): a is AirlineInfo => !!a)
  // The domestic Brazilian flight is often sold with the long one (partnerships); only long-haul airlines of different groups warn.
  const alliances = new Set(path.filter((e) => !e.feeder).map((e) => findAirline(e.airline)?.alliance ?? e.airline))
  return {
    key: segments.map((s) => `${s.from}-${s.airline}-${s.to}`).join('|'),
    segments,
    hours,
    connections: segments.length - 1,
    baggage,
    comfort: comfortOf(infos),
    separateTickets: alliances.size > 1,
    scores: { baggage: 0, time: 0, connections: 0, comfort: 0 },
    score: 0,
  }
}

/** Premium economy on offer and published legroom (31 in = 0, 34 in = 1). */
function comfortOf(airlines: AirlineInfo[]): number {
  if (airlines.length === 0) return 0
  const long = airlines.filter((a) => a.scope === 'international')
  const list = long.length ? long : airlines
  const premium = list.reduce((sum, a) => sum + (a.premiumEconomy === 'yes' ? 1 : a.premiumEconomy === 'some aircraft' ? 0.5 : 0), 0) / list.length
  const pitches = list.map((a) => Number(/(\d+)/.exec(a.legroom?.economy ?? '')?.[1])).filter((n) => n > 0)
  const legroom = pitches.length ? Math.min(1, Math.max(0, (Math.min(...pitches) - 31) / 3)) : 0.5
  return (premium + legroom) / 2
}

const WEIGHTS: Record<Priority, Record<keyof FlightPlan['scores'], number>> = {
  balanced: { baggage: 1, time: 1, connections: 0.6, comfort: 0.5 },
  baggage: { baggage: 3, time: 0.6, connections: 0.4, comfort: 0.3 },
  fastest: { baggage: 0.4, time: 3, connections: 1, comfort: 0.3 },
  comfort: { baggage: 0.6, time: 0.6, connections: 0.4, comfort: 3 },
}

function score(plans: FlightPlan[], priority: Priority): FlightPlan[] {
  const range = (values: number[]) => [Math.min(...values), Math.max(...values)] as const
  const [minH, maxH] = range(plans.map((p) => p.hours))
  const [minC, maxC] = range(plans.map((p) => p.connections))
  const w = WEIGHTS[priority]
  const total = w.baggage + w.time + w.connections + w.comfort
  for (const p of plans) {
    p.scores = {
      baggage: p.baggage.similarity * 0.6 + p.baggage.generosity * 0.4,
      time: maxH === minH ? 1 : 1 - (p.hours - minH) / (maxH - minH),
      connections: maxC === minC ? 1 : 1 - (p.connections - minC) / (maxC - minC),
      comfort: p.comfort,
    }
    p.score = Math.round(
      ((p.scores.baggage * w.baggage + p.scores.time * w.time + p.scores.connections * w.connections + p.scores.comfort * w.comfort) /
        total) *
        100,
    )
  }
  return plans.sort((a, b) => b.score - a.score || a.hours - b.hours)
}

/** A plan as a transport option's journey (times and numbers are filled later, from the ticket). */
export function planJourney(plan: FlightPlan, date?: string): Journey {
  return {
    mode: 'flight',
    from: airportLabel(plan.segments[0].from),
    to: airportLabel(plan.segments.at(-1)!.to),
    date,
    carrier: plan.segments.find((s) => findAirline(s.airline)?.scope === 'international')?.airline ?? plan.segments[0].airline,
    durationHours: Math.round(plan.hours * 4) / 4,
    legs:
      plan.segments.length > 1
        ? plan.segments.map((s) => ({ from: airportLabel(s.from), to: airportLabel(s.to), carrier: s.airline }))
        : undefined,
  }
}

/** Google Flights search for this route (opens their site; nothing is read back). */
export function googleFlightsUrl(plan: FlightPlan, date?: string): string {
  const from = plan.segments[0].from
  const to = plan.segments.at(-1)!.to
  const via = plan.segments.slice(1).map((s) => s.from)
  const q = `Flights from ${from} to ${to}${date ? ` on ${date}` : ''}${via.length ? ` via ${via.join(' ')}` : ''}`
  return `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&hl=en`
}

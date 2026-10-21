// Best visiting order for a day: respects opening hours and visit times,
// then finishes as early as possible. Runs on the device, no API calls.
//
// Travel times come from the saved route between two places when there is
// one, otherwise from an estimate based on the distance.

import { legKey } from '../db/legs'
import type { Leg, Place } from '../db/model'
import { distanceKm } from '../geo'
import { visitMinutes, windowFor } from './hours'

export interface Travel {
  minutes: number
  /** "route" = from the saved segments; "estimate" = from the distance. */
  source: 'route' | 'estimate'
}

/** Travel time from one place to another. */
export function travelBetween(from: Place, to: Place, legs: Map<string, Leg>): Travel {
  const segments = legs.get(legKey(from.id, to.id))?.segments ?? []
  const routed = segments.reduce((sum, s) => sum + (s.durationMinutes ?? 0), 0)
  if (routed > 0) return { minutes: routed, source: 'route' }
  // Streets are ~30% longer than a straight line. Short hops are walked
  // (4.5 km/h); longer ones by transit (~22 km/h plus ~12 min to reach the
  // station, wait and transfer).
  const km = distanceKm(from, to) * 1.3
  const minutes = km <= 1.5 ? (km / 4.5) * 60 : 12 + (km / 22) * 60
  return { minutes: Math.max(1, Math.round(minutes)), source: 'estimate' }
}

export interface Stop {
  place: Place
  travel: Travel | null
  /** Minutes since midnight. */
  arrive: number
  /** Visit start (after waiting for the opening, if early). */
  start: number
  leave: number
  wait: number
  /** Minutes of the visit that fall outside the opening hours. */
  late: number
  closed: boolean
}

export interface Schedule {
  stops: Stop[]
  finish: number
  /** Places closed that day or visited past closing time. */
  conflicts: number
  lateMinutes: number
  waitMinutes: number
  travelMinutes: number
}

type TravelFn = (from: Place, to: Place) => Travel

/** Timetable of visiting the places in this order, starting at `start`. */
export function buildSchedule(order: Place[], start: number, weekday: number, travel: TravelFn): Schedule {
  const stops: Stop[] = []
  let time = start
  let conflicts = 0
  let lateMinutes = 0
  let waitMinutes = 0
  let travelMinutes = 0

  // The last place actually visited (closed places are skipped).
  let previous: Place | null = null

  order.forEach((place) => {
    const window = windowFor(place.openingHours, weekday)
    if (window === 'closed') {
      // Can't be visited this day: takes no time, flagged as a conflict.
      conflicts++
      stops.push({ place, travel: null, arrive: time, start: time, leave: time, wait: 0, late: 0, closed: true })
      return
    }
    const leg = previous ? travel(previous, place) : null
    if (leg) {
      time += leg.minutes
      travelMinutes += leg.minutes
    }
    previous = place
    const arrive = time
    const duration = visitMinutes(place)
    let begin = arrive
    let late = 0
    if (window !== 'unknown') {
      begin = Math.max(arrive, window.open)
      late = Math.max(0, begin + duration - window.close)
    }
    if (late > 0) {
      conflicts++
      lateMinutes += late
    }
    waitMinutes += begin - arrive
    time = begin + duration
    stops.push({ place, travel: leg, arrive, start: begin, leave: time, wait: begin - arrive, late, closed: false })
  })

  return { stops, finish: time, conflicts, lateMinutes, waitMinutes, travelMinutes }
}

/** Lower is better: conflicts first, then minutes past closing, then the finish time, then travel. */
function cost(s: Schedule): number {
  return s.conflicts * 1e7 + s.lateMinutes * 1e4 + s.finish * 10 + s.travelMinutes
}

export interface OptimizeOptions {
  /** Minutes since midnight. */
  start: number
  weekday: number
  /** Keep the first place first (e.g. the hotel). */
  fixFirst: boolean
  /** Keep the last place last (e.g. back to the hotel). */
  fixLast: boolean
  legs: Map<string, Leg>
}

export interface Optimized {
  order: Place[]
  schedule: Schedule
  /** True when every possible order was tried (the result is the best one). */
  exact: boolean
}

/** Every order is tried up to this many movable places (8! = 40,320 orders). */
const EXACT_LIMIT = 8

export function optimizeOrder(places: Place[], options: OptimizeOptions): Optimized {
  const { start, weekday, fixFirst, fixLast } = options
  // Travel times are computed once per pair.
  const cache = new Map<string, Travel>()
  const travel: TravelFn = (a, b) => {
    const key = legKey(a.id, b.id)
    let value = cache.get(key)
    if (!value) cache.set(key, (value = travelBetween(a, b, options.legs)))
    return value
  }

  const head = fixFirst && places.length > 1 ? [places[0]] : []
  const tail = fixLast && places.length > head.length + 1 ? [places[places.length - 1]] : []
  const movable = places.slice(head.length, places.length - tail.length)
  // Places closed that day go to the end of the list; they aren't part of the route.
  const isClosed = (p: Place) => windowFor(p.openingHours, weekday) === 'closed'
  const closed = movable.filter(isClosed)
  const free = movable.filter((p) => !isClosed(p))
  const evaluate = (middle: Place[]) => {
    const order = [...head, ...middle, ...tail, ...closed]
    const schedule = buildSchedule(order, start, weekday, travel)
    return { order, schedule, score: cost(schedule) }
  }

  let best = evaluate(free)
  const consider = (middle: Place[]) => {
    const candidate = evaluate(middle)
    if (candidate.score < best.score) best = candidate
    return candidate.score
  }

  if (free.length <= EXACT_LIMIT) {
    permute(free, (middle) => consider(middle))
    return { order: best.order, schedule: best.schedule, exact: true }
  }

  // Too many to try them all: improve from a few starting orders by moving
  // one place at a time and reversing stretches, until nothing gets better.
  for (const startOrder of [free, nearestNeighbor(free, head[0], travel)]) {
    let current = [...startOrder]
    let currentScore = consider(current)
    let improved = true
    while (improved) {
      improved = false
      for (const next of neighbors(current)) {
        const score = consider(next)
        if (score < currentScore) {
          current = next
          currentScore = score
          improved = true
          break
        }
      }
    }
  }
  return { order: best.order, schedule: best.schedule, exact: false }
}

/** Calls `visit` with every permutation of `items` (Heap's algorithm). */
function permute<T>(items: T[], visit: (permutation: T[]) => void): void {
  const a = [...items]
  const c = new Array(a.length).fill(0)
  visit([...a])
  let i = 0
  while (i < a.length) {
    if (c[i] < i) {
      const j = i % 2 === 0 ? 0 : c[i]
      ;[a[j], a[i]] = [a[i], a[j]]
      visit([...a])
      c[i]++
      i = 0
    } else {
      c[i] = 0
      i++
    }
  }
}

/** Each next place is the closest one not visited yet. */
function nearestNeighbor(places: Place[], from: Place | undefined, travel: TravelFn): Place[] {
  const left = [...places]
  const order: Place[] = []
  let current = from ?? left.shift()!
  if (!from) order.push(current)
  while (left.length) {
    left.sort((a, b) => travel(current, a).minutes - travel(current, b).minutes)
    current = left.shift()!
    order.push(current)
  }
  return order
}

/** Orders one small change away: one place moved elsewhere, or a stretch reversed. */
function* neighbors(order: Place[]): Generator<Place[]> {
  const n = order.length
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue
      const moved = [...order]
      const [place] = moved.splice(i, 1)
      moved.splice(j, 0, place)
      yield moved
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 2; j <= n; j++) {
      yield [...order.slice(0, i), ...order.slice(i, j).reverse(), ...order.slice(j)]
    }
  }
}

// Rail passes (Japan trips; User's picks from a mock, 2026-10-31): each pass typed by User (name, price per person,
// days, the companies it is valid on) is compared with the fares of the days' routes (from NAVITIME), over the
// consecutive days where it covers the most (or the days chosen). A pass "in use" is paid before the trip and the
// fares it covers leave the days' estimates (struck through in the legs, tagged with the pass).
// Only the companies are compared: a pass's own exceptions (the JR Pass and the Nozomi…) stay in User's notes.

import { createContext } from 'react'
import { dayRoute } from '../db/baseStops'
import { legKey } from '../db/legs'
import type { Day, Leg, Place, RailPass, Segment } from '../db/model'
import { orderPlaces } from '../db/trips'
import type { Money } from '../routing/types'

/** The JR companies, by their English name and the one NAVITIME writes ("ＪＲ西日本", read as "JR西日本"). */
export const JR_COMPANIES: Record<string, string[]> = {
  'JR East': ['east japan railway', 'jr東日本'],
  'JR Central': ['central japan railway', 'jr東海'],
  'JR West': ['west japan railway', 'jr西日本'],
  'JR Kyushu': ['kyushu railway', 'jr九州'],
  'JR Hokkaido': ['hokkaido railway', 'jr北海道'],
  'JR Shikoku': ['shikoku railway', 'jr四国'],
}
export const ALL_JR = 'All JR'

/** Rides a pass could cover (not walks, taxis, cars or flights). */
const RIDES = new Set<Segment['mode']>(['train', 'subway', 'bus', 'ferry', 'shinkansen', 'other'])

const plain = (text: string | undefined) => (text ?? '').normalize('NFKC').toLowerCase()

/** The texts a segment's company can be read from. */
function companyTexts(segment: Segment): string[] {
  return [plain(segment.operator), plain(segment.originalNames?.operator), plain(segment.originalNames?.line), plain(segment.lineName)]
}

function isJr(segment: Segment): boolean {
  const [operator, operatorJa, lineJa, line] = companyTexts(segment)
  return (
    Object.values(JR_COMPANIES).some((names) => names.some((n) => operator.includes(n) || operatorJa.includes(n))) ||
    operatorJa.startsWith('jr') ||
    lineJa.startsWith('jr') ||
    line.startsWith('jr ')
  )
}

/** Whether a pass covers a ride. */
export function passCovers(pass: RailPass, segment: Segment): boolean {
  if (!RIDES.has(segment.mode)) return false
  if (segment.mode === 'shinkansen' && !pass.shinkansen) return false
  const [operator, operatorJa] = companyTexts(segment)
  return pass.validOn.some((company) => {
    if (company === ALL_JR) return isJr(segment)
    const jr = JR_COMPANIES[company]
    if (jr) return jr.some((n) => operator.includes(n) || operatorJa.includes(n))
    return operator !== '' && operator === plain(company)
  })
}

/** The rides of each day (in date order), along its route: base stops included. */
export function dayRides(days: Day[], places: Place[], legs: Map<string, Leg>): { day: Day; rides: Segment[] }[] {
  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      const route = dayRoute(day, orderPlaces(day, places.filter((p) => p.dayId === day.id)))
      const rides = route.slice(1).flatMap((stop, i) => legs.get(legKey(route[i].id, stop.id))?.segments ?? []).filter((s) => RIDES.has(s.mode))
      return { day, rides }
    })
}

/** The companies of the trip's rides other than JR, for a pass's "Valid on" choices ("Osaka Metro"…). */
export function otherCompanies(rides: { rides: Segment[] }[]): string[] {
  const names = new Set<string>()
  for (const { rides: list } of rides) for (const s of list) if (s.operator && !isJr(s) && s.mode !== 'flight') names.add(s.operator)
  return [...names].sort()
}

export interface PassReport {
  pass: RailPass
  /** First and last day it covers, 1-based (the trip's day numbers). */
  firstDay: number
  lastDay: number
  /** The days where it covers the most (shown when the start isn't chosen). */
  bestFirstDay: number
  /** Fares it covers per person, in the pass's currency. */
  covered: Money
  rides: number
  /** Covered minus the price: positive = it saves money. */
  saves?: number
}

export interface PassCoverage {
  reports: PassReport[]
  /** Segment id → the name of the pass in use that covers it. */
  covered: Map<string, string>
}

export function passCoverage(passes: RailPass[] | undefined, rides: { day: Day; rides: Segment[] }[]): PassCoverage {
  const covered = new Map<string, string>()
  const reports = (passes ?? []).map((pass) => {
    const currency = pass.price?.currency ?? 'JPY'
    const length = Math.max(1, Math.min(pass.days, rides.length))
    const fareOn = (i: number) =>
      rides[i].rides.reduce((sum, s) => sum + (passCovers(pass, s) && s.fare?.currency === currency ? s.fare.amount : 0), 0)
    const windowSum = (start: number) => Array.from({ length }, (_, k) => (start + k < rides.length ? fareOn(start + k) : 0)).reduce((a, b) => a + b, 0)
    let best = 0
    for (let start = 1; start + length <= rides.length; start++) if (windowSum(start) > windowSum(best)) best = start
    const chosen = pass.startDate ? rides.findIndex((r) => r.day.date === pass.startDate) : -1
    const start = chosen >= 0 ? Math.min(chosen, Math.max(0, rides.length - length)) : best
    const inWindow = rides.slice(start, start + length).flatMap((r) => r.rides).filter((s) => passCovers(pass, s))
    if (pass.use) for (const s of inWindow) if (!covered.has(s.id)) covered.set(s.id, pass.name)
    const amount = windowSum(start)
    return {
      pass,
      firstDay: start + 1,
      lastDay: start + length,
      bestFirstDay: best + 1,
      covered: { amount, currency },
      rides: inWindow.length,
      saves: pass.price ? amount - pass.price.amount : undefined,
    }
  })
  return { reports, covered }
}

/** Rides usually paid with an IC card (Suica, ICOCA…): not the shinkansen, taxis, flights or ferries. */
const IC_RIDES = new Set<Segment['mode']>(['train', 'subway', 'bus'])

/**
 * How much to load on each IC card (Suica…): the yen fares of the days' trains, subways and buses that no rail pass
 * in use covers, per person (User, 2026-10-31).
 */
export function icCardFares(rides: { rides: Segment[] }[], covered: Map<string, string>): number {
  let sum = 0
  for (const { rides: list } of rides) {
    for (const s of list) if (IC_RIDES.has(s.mode) && !covered.has(s.id) && s.fare?.currency === 'JPY') sum += s.fare.amount
  }
  return sum
}

/** Segment id → the pass in use covering it, for the legs (provided by the day page). */
export const PassCoverageContext = createContext<Map<string, string>>(new Map())

// Baggage for a sequence of airlines (e.g. GOL → Qatar → Qatar): what fits
// every flight, which airline is the strictest, which fare gives the checked
// bags you need, and how alike the airlines' rules are (fewer surprises).

import { AIRLINES, checkedForFare, findAirline, strictestBag, type AirlineInfo, type BagRule, type CheckedRule } from '../data/airlines'

export interface BagRow {
  /** What fits every flight (null: some airline allows no separate item). */
  fits: BagRule | null
  /** The airline that sets the limit, when one stands out. */
  strictest?: string
  perAirline: { airline: AirlineInfo; bag: BagRule | null }[]
}

export interface CheckedRow {
  needed: number
  perAirline: {
    airline: AirlineInfo
    /** The fare typed on the option, if it matches this airline's fares. */
    chosen?: CheckedRule
    /** The cheapest fare (as listed) that includes the bags needed. */
    cheapestWithBags?: CheckedRule
  }[]
  /** On one ticket, usually the main airline's allowance applies to the whole trip. */
  main?: AirlineInfo
}

export interface TripBaggage {
  airlines: AirlineInfo[]
  /** Carriers not in the guide. */
  unknown: string[]
  personal: BagRow
  carryOn: BagRow
  checked: CheckedRow
  /** 0–1: how alike the rules are (1 = the same bags work everywhere). */
  similarity: number
  /** 0–1: how much you can bring when following the strictest rules. */
  generosity: number
}

const volume = (bag: BagRule | null) => (bag?.cm ? bag.cm[0] * bag.cm[1] * bag.cm[2] : bag?.linearCm ? (bag.linearCm / 3) ** 3 : undefined)

/** Smallest ÷ largest among known values (1 when they agree or nothing is known). */
function ratio(values: (number | undefined)[]): number {
  const known = values.filter((v): v is number => v != null && v > 0)
  return known.length < 2 ? 1 : Math.min(...known) / Math.max(...known)
}

/** The airline with the smallest bag, when the bags differ. */
function strictestAirline(rows: { airline: AirlineInfo; bag: BagRule | null }[]): string | undefined {
  if (rows.length < 2) return undefined
  const none = rows.find((r) => r.bag === null)
  if (none) return none.airline.name
  const scored = rows.map((r) => ({ name: r.airline.name, v: volume(r.bag) ?? Infinity, kg: r.bag?.kg }))
  // Weights are compared only when both are published.
  const lighter = (a: (typeof scored)[number], b: (typeof scored)[number]) => a.kg != null && b.kg != null && a.kg < b.kg
  const min = scored.reduce((a, b) => (b.v < a.v || (b.v === a.v && lighter(b, a)) ? b : a))
  return scored.every((s) => s.v === min.v && !lighter(min, s)) ? undefined : min.name
}

const piecesOf = (rule: CheckedRule) => (typeof rule.pieces === 'number' ? rule.pieces : rule.pieces === 'included' ? 1 : parseInt(rule.pieces, 10) || 0)

export function tripBaggage(carriers: string[], { fare, main, checkedBags = 1 }: { fare?: string; main?: string; checkedBags?: number } = {}): TripBaggage {
  const airlines = [...new Map(carriers.map((c) => findAirline(c)).filter((a): a is AirlineInfo => !!a).map((a) => [a.name, a])).values()]
  const unknown = [...new Set(carriers.filter((c) => c && !findAirline(c)))]
  const mainAirline = findAirline(main) ?? airlines.find((a) => a.scope === 'international') ?? airlines[0]

  const personalRows = airlines.map((airline) => ({ airline, bag: airline.personalItem }))
  const carryRows = airlines.map((airline) => ({ airline, bag: airline.carryOn }))
  const personal: BagRow = { fits: strictestBag(personalRows.map((r) => r.bag)), strictest: strictestAirline(personalRows), perAirline: personalRows }
  const carryOn: BagRow = { fits: strictestBag(carryRows.map((r) => r.bag)), strictest: strictestAirline(carryRows), perAirline: carryRows }

  const checked: CheckedRow = {
    needed: checkedBags,
    main: mainAirline,
    perAirline: airlines.map((airline) => ({
      airline,
      chosen: airline.name === mainAirline?.name ? checkedForFare(airline, fare) : undefined,
      cheapestWithBags: airline.checked.find((r) => piecesOf(r) >= checkedBags),
    })),
  }

  // Alike: same personal-item situation, similar carry-on size and weight, and
  // the bags you need in each airline's cheapest fare (or all needing an upgrade).
  const personalAlike = personalRows.some((r) => r.bag === null) && personalRows.some((r) => r.bag !== null) ? 0.4 : ratio(personalRows.map((r) => volume(r.bag)))
  const carryAlike = (ratio(carryRows.map((r) => r.bag?.kg)) + ratio(carryRows.map((r) => volume(r.bag)))) / 2
  const cheapestHasBags = airlines.map((a) => (a.checked[0] ? piecesOf(a.checked[0]) >= checkedBags : false))
  const checkedAlike = airlines.length < 2 ? 1 : cheapestHasBags.every((x) => x === cheapestHasBags[0]) ? 1 : 0.5
  const similarity = airlines.length === 0 ? 0 : (personalAlike + carryAlike + checkedAlike) / 3

  // Generous: a separate personal item, and a heavy, big carry-on (12 kg / 55×40×25 count as full marks).
  const fitsKg = carryOn.fits?.kg ?? 7
  const fitsVolume = volume(carryOn.fits) ?? 50 * 35 * 20
  const generosity = airlines.length === 0 ? 0 : ((personal.fits ? 1 : 0.4) + Math.min(1, fitsKg / 12) + Math.min(1, fitsVolume / (55 * 40 * 25))) / 3

  return { airlines, unknown, personal, carryOn, checked, similarity, generosity }
}

/** Every airline the guide knows, for pickers. */
export const GUIDE_AIRLINE_NAMES = AIRLINES.map((a) => a.name)

// Comparing options of the same kind in the same city (e.g. hotels in Osaka):
// price, distance and your own rating, combined into a 0–100 score with
// weights you choose. Everything is computed on the device.

import { displayAmount } from '../budget'
import type { OptionKind, Stay, Trip, TripOption } from '../db/model'
import type { Money } from '../routing/types'
import { stayNights, stayOfCity } from '../db/stays'
import { distanceKm } from '../geo'

export interface Weights {
  price: number
  distance: number
  rating: number
}

/** 0 = ignore, 1 = low, 2 = normal, 3 = high. */
export const DEFAULT_WEIGHTS: Weights = { price: 2, distance: 2, rating: 2 }

export type Badge = 'cheapest' | 'closest' | 'fastest' | 'top-rated' | 'best'

export interface Scored {
  option: TripOption
  /** Hotels: total for the stay (given, or price × nights). */
  total?: Money
  /** Nights used for a hotel total. */
  nights?: number
  /** Amount compared on price, in the display currency. */
  compareAmount: number | null
  distanceKm: number | null
  /** Transport: total travel time (takes the place of distance in the score). */
  durationHours: number | null
  /** 0–100, null when nothing can be compared. */
  score: number | null
  badges: Badge[]
}

export interface Group {
  key: string
  kind: OptionKind
  city: string
  /** Transport: "Navegantes → Osaka" (transport is grouped by route, not city). */
  route?: string
  stay?: Stay
  /** Where distances are measured from. */
  reference?: { name: string; lat: number; lng: number }
  items: Scored[]
}

/** "navegantes → osaka" for grouping (airport codes and case ignored). */
function routeKey(option: TripOption): string {
  const norm = (s: string | undefined) => (s ?? '').toLowerCase().replace(/\(.*?\)/g, '').trim()
  return `${norm(option.journey?.from)} → ${norm(option.journey?.to)}`
}

/** Splits options into kind + city (or route) groups and scores each group. */
export function compareOptions(options: TripOption[], trip: Trip, stays: Stay[], weights: Weights): Group[] {
  const groups = new Map<string, TripOption[]>()
  for (const option of options) {
    const where = option.kind === 'transport' ? routeKey(option) : (option.city ?? '').trim().toLowerCase()
    const key = `${option.kind}|${where}`
    groups.set(key, [...(groups.get(key) ?? []), option])
  }

  return [...groups.entries()].map(([key, list]) => {
    const kind = list[0].kind
    const city = list[0].city?.trim() ?? ''
    const route = kind === 'transport' && list[0].journey ? `${list[0].journey.from} → ${list[0].journey.to}` : undefined
    const stay = stayOfCity(stays, city)
    const reference = referencePoint(kind, stay, options, city)
    const nights = stay ? stayNights(stay, trip).nights : undefined

    const items: Scored[] = list.map((option) => {
      let total: Money | undefined
      if (kind === 'hotel') {
        total = option.totalPrice ?? (option.price && nights ? { ...option.price, amount: option.price.amount * nights } : undefined)
      }
      const money = total ?? option.price
      const compareAmount = money ? displayAmount({ [money.currency]: money.amount }, trip) : null
      const distance =
        reference && option.lat != null && option.lng != null ? distanceKm(reference, { lat: option.lat, lng: option.lng }) : null
      return {
        option,
        total,
        nights: kind === 'hotel' && !option.totalPrice ? nights : undefined,
        compareAmount,
        distanceKm: distance,
        durationHours: option.journey?.durationHours ?? null,
        score: null,
        badges: [],
      }
    })

    score(items.filter((i) => i.option.status !== 'discarded'), weights)
    return { key, kind, city, route, stay, reference, items }
  })
}

/**
 * Hotels are measured from the city's base (e.g. a station, not a hotel);
 * everything else from the chosen hotel in that city, or the base.
 */
function referencePoint(kind: OptionKind, stay: Stay | undefined, options: TripOption[], city: string) {
  if (kind === 'transport') return undefined
  if (kind !== 'hotel') {
    const hotel = options.find(
      (o) => o.kind === 'hotel' && o.status === 'chosen' && o.lat != null && (o.city ?? '').trim().toLowerCase() === city.toLowerCase(),
    )
    if (hotel) return { name: hotel.name, lat: hotel.lat!, lng: hotel.lng! }
  }
  // Hotels measured from a hotel would only say how far they are from each other.
  if (kind === 'hotel' && stay?.base?.kind === 'hotel') return undefined
  return stay?.base
}

function score(items: Scored[], weights: Weights): void {
  // Each criterion becomes 0–1 within the group (1 = best). When some options
  // have a value and others don't, the missing ones count as neutral (0.5),
  // so leaving something unrated neither wins nor loses.
  const norm = (values: (number | null)[], lowerIsBetter: boolean) => {
    const known = values.filter((v): v is number => v != null)
    const min = Math.min(...known)
    const max = Math.max(...known)
    return values.map((v) => {
      if (v == null) return known.length ? 0.5 : null
      if (max === min) return 1
      return lowerIsBetter ? (max - v) / (max - min) : (v - min) / (max - min)
    })
  }
  const price = norm(
    items.map((i) => i.compareAmount),
    true,
  )
  // Distance for places; travel time for transport (same weight).
  const distance = norm(
    items.map((i) => i.distanceKm ?? i.durationHours),
    true,
  )
  // Ratings are absolute (1 = 0, 5 = 1), not relative to the group.
  const anyRating = items.some((i) => i.option.rating)
  const rating = items.map((i) => (i.option.rating ? (i.option.rating - 1) / 4 : anyRating ? 0.5 : null))

  items.forEach((item, i) => {
    const parts: [number | null, number][] = [
      [price[i], weights.price],
      [distance[i], weights.distance],
      [rating[i], weights.rating],
    ]
    const used = parts.filter(([v, w]) => v != null && w > 0) as [number, number][]
    const weight = used.reduce((sum, [, w]) => sum + w, 0)
    item.score = weight > 0 ? Math.round((used.reduce((sum, [v, w]) => sum + v * w, 0) / weight) * 100) : null
  })

  // Badges only make sense with something to compare against.
  if (items.length < 2) return
  const award = (badge: Badge, pick: (i: Scored) => number | null, lowest: boolean) => {
    const known = items.filter((i) => pick(i) != null)
    if (known.length < 2) return
    const value = (lowest ? Math.min : Math.max)(...known.map((i) => pick(i)!))
    known.filter((i) => pick(i) === value).forEach((i) => i.badges.push(badge))
  }
  award('cheapest', (i) => i.compareAmount, true)
  award('closest', (i) => i.distanceKm, true)
  award('fastest', (i) => i.durationHours, true)
  award('top-rated', (i) => i.option.rating ?? null, false)
  award('best', (i) => i.score, false)
}

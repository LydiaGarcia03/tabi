// Budget totals per day and per trip. Amounts are kept per currency and only
// converted for display, with the trip's manual exchange rate
// (1 baseCurrency = exchangeRate displayCurrency).

import { dayRoute } from './db/baseStops'
import { legKey } from './db/legs'
import type { Day, Expense, ExpenseCategory, Leg, Place, PlaceKind, Segment, Trip, TripOption } from './db/model'
import { orderPlaces } from './db/trips'
import { formatMoney } from './format'
import type { IconName } from './iconPaths'
import type { Money } from './routing/types'

/** Amount per currency code, e.g. { JPY: 12300, BRL: 200 }. */
export type Totals = Record<string, number>

export interface Budget {
  total: Totals
  byCategory: Partial<Record<ExpenseCategory, Totals>>
}

export const CATEGORIES: ExpenseCategory[] = ['activities', 'transport', 'lodging', 'food', 'shopping', 'other']

/** Line icon of each category (see iconPaths.ts). */
export const CATEGORY_ICON: Record<ExpenseCategory, IconName> = {
  activities: 'ticket',
  transport: 'train',
  lodging: 'home',
  food: 'food',
  shopping: 'bag',
  other: 'box',
}

/** Plain text (dropdowns can't show icons; elsewhere it goes after CATEGORY_ICON). */
export const CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  activities: 'Activities',
  transport: 'Transport',
  lodging: 'Lodging',
  food: 'Food',
  shopping: 'Shopping',
  other: 'Other',
}

export function emptyBudget(): Budget {
  return { total: {}, byCategory: {} }
}

function add(budget: Budget, category: ExpenseCategory, money: Money | undefined): void {
  if (!money || !Number.isFinite(money.amount) || money.amount === 0) return
  const { amount, currency } = money
  budget.total[currency] = (budget.total[currency] ?? 0) + amount
  const totals = (budget.byCategory[category] ??= {})
  totals[currency] = (totals[currency] ?? 0) + amount
}

/** How many people are going on the trip (at least 1). */
export function travelersOf(trip: Pick<Trip, 'travelers'>): number {
  return trip.travelers != null && trip.travelers >= 1 ? Math.round(trip.travelers) : 1
}

/** A price of a place or of a restaurant/place/shop option: per person (default) or for the group. */
export interface Priced {
  price?: Money
  forGroup?: boolean
  /** People going; absent = everyone on the trip. */
  people?: number
}

/** Budget category of each kind of place. */
export const PLACE_KIND_CATEGORY: Record<PlaceKind, ExpenseCategory> = {
  place: 'activities',
  restaurant: 'food',
  shop: 'shopping',
  other: 'other',
}

/** How many people go: the item's own number, else everyone on the trip. */
export function peopleGoing(people: number | undefined, travelers: number): number {
  return people != null && people >= 1 ? Math.round(people) : travelers
}

/** What it costs the people going: the per-person price × people, or the group price as typed. */
export function pricedTotal({ price, forGroup, people }: Priced, travelers: number): Money | undefined {
  if (!price || forGroup) return price
  return { ...price, amount: price.amount * peopleGoing(people, travelers) }
}

/** Per-person price (a group price split among the people going), to compare options fairly. */
export function pricePerPerson({ price, forGroup, people }: Priced, travelers: number): Money | undefined {
  if (!price || !forGroup) return price
  return { ...price, amount: price.amount / peopleGoing(people, travelers) }
}

/** "¥1,000 × 2 = ¥2,000", "¥1,000 · 1 person", "¥6,000 for the group", or just the price on a trip for one. */
export function describePriced(priced: Priced, travelers: number): string {
  const { price, forGroup, people } = priced
  if (!price) return ''
  const going = peopleGoing(people, travelers)
  if (forGroup) return `${formatMoney(price)} for the group`
  if (going === 1) return travelers > 1 ? `${formatMoney(price)} · 1 person` : formatMoney(price)
  return `${formatMoney(price)} × ${going} = ${formatMoney(pricedTotal(priced, travelers)!)}`
}

export const placePriced = (place: Place): Priced => ({ price: place.cost, forGroup: place.costForGroup, people: place.people })

export const optionPriced = (option: TripOption): Priced => ({ price: option.price, forGroup: option.priceForGroup, people: option.people })

/** What a place costs the people going. */
export function placeCost(place: Place, travelers: number): Money | undefined {
  return pricedTotal(placePriced(place), travelers)
}

export function describePlaceCost(place: Place, travelers: number): string {
  return describePriced(placePriced(place), travelers)
}

/** Segment fares are per person, except taxis (per car). */
export function segmentCost(segment: Pick<Segment, 'mode' | 'fare'>, travelers: number): Money | undefined {
  if (!segment.fare || segment.mode === 'taxi') return segment.fare
  return { ...segment.fare, amount: segment.fare.amount * travelers }
}

/**
 * Costs of one day: place costs (by kind: activities, food…), fares
 * of the legs between its consecutive places (transport) and the day's
 * expenses. Per-person prices count once per person going.
 */
export function dayBudget(
  day: Day,
  dayPlaces: Place[],
  legs: Map<string, Leg>,
  dayExpenses: Expense[],
  travelers: number,
): Budget {
  const budget = emptyBudget()
  // With the base stops: going back to the hotel costs its fares too.
  const route = dayRoute(day, orderPlaces(day, dayPlaces))
  route.forEach((stop, i) => {
    if (!stop.baseStop) add(budget, PLACE_KIND_CATEGORY[stop.kind ?? 'place'], placeCost(stop, travelers))
    const next = route[i + 1]
    if (next) legs.get(legKey(stop.id, next.id))?.segments.forEach((s) => add(budget, 'transport', segmentCost(s, travelers)))
  })
  dayExpenses.forEach((e) => add(budget, e.category, e.amount))
  return budget
}

export function expensesBudget(expenses: Expense[]): Budget {
  const budget = emptyBudget()
  expenses.forEach((e) => add(budget, e.category, e.amount))
  return budget
}

export function mergeBudgets(budgets: Budget[]): Budget {
  const merged = emptyBudget()
  for (const budget of budgets) {
    for (const category of CATEGORIES) {
      for (const [currency, amount] of Object.entries(budget.byCategory[category] ?? {})) {
        add(merged, category, { amount, currency })
      }
    }
  }
  return merged
}

/**
 * Total in the display currency: base-currency amounts converted with the
 * trip rate plus amounts already in the display currency. Other currencies
 * can't be converted and are returned apart. `null` when the rate isn't set.
 */
export function inDisplayCurrency(totals: Totals, trip: Trip): { amount: number; unconverted: Money[] } | null {
  if (!(trip.exchangeRate > 0)) return null
  let amount = 0
  const unconverted: Money[] = []
  for (const [currency, value] of Object.entries(totals)) {
    if (currency === trip.baseCurrency) amount += value * trip.exchangeRate
    else if (currency === trip.displayCurrency) amount += value
    else unconverted.push({ amount: value, currency })
  }
  return { amount, unconverted }
}

/**
 * One number in the display currency, or null when that can't be done
 * exactly (rate missing, or a currency other than the trip's two).
 */
export function displayAmount(totals: Totals, trip: Trip): number | null {
  const entries = Object.entries(totals)
  if (entries.every(([currency]) => currency === trip.displayCurrency)) {
    return entries.reduce((sum, [, value]) => sum + value, 0)
  }
  const converted = inDisplayCurrency(totals, trip)
  return converted && converted.unconverted.length === 0 ? converted.amount : null
}

/** All the trip's estimates in the display currency (null when a currency can't be converted). */
export function estimatesTotal(trip: Trip): number | null {
  const totals: Totals = {}
  for (const e of trip.estimates ?? []) totals[e.amount.currency] = (totals[e.amount.currency] ?? 0) + e.amount.amount
  return displayAmount(totals, trip)
}

/** Totals as money values, base currency first. */
export function totalsList(totals: Totals, trip: Trip): Money[] {
  return Object.entries(totals)
    .map(([currency, amount]) => ({ amount, currency }))
    .sort((a, b) => Number(b.currency === trip.baseCurrency) - Number(a.currency === trip.baseCurrency))
}

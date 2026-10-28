// Budget totals per day and per trip. Amounts are kept per currency and only
// converted for display, each currency with its rate to "my money"
// (displayCurrency; see money/currencies.ts).

import { today } from './dates'
import { dayRoute } from './db/baseStops'
import { legKey } from './db/legs'
import type { Day, Estimate, Expense, ExpenseCategory, Leg, Place, PlaceKind, Segment, Trip, TripOption } from './db/model'
import { orderPlaces } from './db/trips'
import { formatMoney } from './format'
import type { IconName } from './iconPaths'
import { expenseNeedsBooking, JOURNEY_ICON, journeyTitle } from './planning/journeys'
import { rateOf } from './money/currencies'
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

/** Segment fares are per person, except taxis and cars (per car). */
export function segmentCost(segment: Pick<Segment, 'mode' | 'fare'>, travelers: number): Money | undefined {
  if (!segment.fare || segment.mode === 'taxi' || segment.mode === 'car') return segment.fare
  return { ...segment.fare, amount: segment.fare.amount * travelers }
}

/**
 * The money side of the trip (User's model, 2026-10-27): what needs booking is paid before the trip (the
 * checklist's items); everything else in the itinerary is an estimate; what is really spent is logged on the days.
 * `day` is the day's number (1-based); absent = the whole trip.
 */
export interface MoneyItem {
  id: string
  name: string
  day?: number
  category: ExpenseCategory
  /** Absent: no price typed yet (still counted as an item to book). */
  amount?: Money
  icon: IconName
  /** Only for what needs booking: ticked "Booked" (paid). */
  booked?: boolean
}

export interface TripMoney {
  /** Hotels, flights, transport with "Booking needed", places needing a ticket or a reservation. */
  bookAhead: MoneyItem[]
  /** The rest of the itinerary: places, the days' fares, trip-wide costs that need no booking. Estimates. */
  itinerary: MoneyItem[]
  /** Money really spent, logged on the days (day expenses). */
  spent: MoneyItem[]
}

/**
 * One day's items: its places (those needing a ticket or reservation apart) and the fares of the legs along
 * its route (base stops included: going back to the hotel costs its fares too), one item per currency.
 */
export function dayMoney(
  day: Day,
  number: number,
  dayPlaces: Place[],
  legs: Map<string, Leg>,
  travelers: number,
): Pick<TripMoney, 'bookAhead' | 'itinerary'> {
  const bookAhead: MoneyItem[] = []
  const itinerary: MoneyItem[] = []
  const fares: Totals = {}
  const route = dayRoute(day, orderPlaces(day, dayPlaces))
  route.forEach((stop, i) => {
    if (!stop.baseStop) {
      const category = PLACE_KIND_CATEGORY[stop.kind ?? 'place']
      const item: MoneyItem = { id: stop.id, name: stop.name, day: number, category, amount: placeCost(stop, travelers), icon: CATEGORY_ICON[category] }
      if (stop.bookAhead) bookAhead.push({ ...item, booked: !!stop.booked })
      else if (item.amount?.amount) itinerary.push(item)
    }
    const next = route[i + 1]
    if (!next) return
    legs.get(legKey(stop.id, next.id))?.segments.forEach((s) => {
      const cost = segmentCost(s, travelers)
      if (cost?.amount) fares[cost.currency] = (fares[cost.currency] ?? 0) + cost.amount
    })
  })
  for (const [currency, amount] of Object.entries(fares)) {
    itinerary.push({ id: `fares-${day.id}-${currency}`, name: 'Fares', day: number, category: 'transport', amount: { amount, currency }, icon: 'train' })
  }
  return { bookAhead, itinerary }
}

/** Everything of the trip, split as in `TripMoney`. Only places in a day's order count. */
export function tripMoney(days: Day[], places: Place[], legs: Leg[], expenses: Expense[], travelers: number): TripMoney {
  const legMap = new Map(legs.map((l) => [legKey(l.fromPlaceId, l.toPlaceId), l]))
  const money: TripMoney = { bookAhead: [], itinerary: [], spent: [] }
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date))
  sorted.forEach((day, i) => {
    const { bookAhead, itinerary } = dayMoney(day, i + 1, places.filter((p) => p.dayId === day.id), legMap, travelers)
    money.bookAhead.push(...bookAhead)
    money.itinerary.push(...itinerary)
  })
  const dayNumber = new Map(sorted.map((d, i) => [d.id, i + 1]))
  for (const e of expenses) {
    const item: MoneyItem = { id: e.id, name: e.description, category: e.category, amount: e.amount, icon: CATEGORY_ICON[e.category] }
    if (e.dayId) {
      if (dayNumber.has(e.dayId)) money.spent.push({ ...item, day: dayNumber.get(e.dayId) })
    } else if (expenseNeedsBooking(e)) {
      const icon = e.hotel ? 'home' : JOURNEY_ICON[e.journey!.mode]
      money.bookAhead.push({ ...item, name: e.hotel?.name ?? journeyTitle(e.journey!), icon, booked: !!e.booked })
    } else {
      money.itinerary.push(e.journey ? { ...item, name: journeyTitle(e.journey), icon: JOURNEY_ICON[e.journey.mode] } : item)
    }
  }
  return money
}

/** Items added up per category and currency. */
export function itemsBudget(items: Pick<MoneyItem, 'category' | 'amount'>[]): Budget {
  const budget = emptyBudget()
  items.forEach((item) => add(budget, item.category, item.amount))
  return budget
}

/** An item's amount in the display currency (null when it can't be converted exactly). */
export function itemAmount(item: { amount?: Money }, trip: Trip): number | null {
  return item.amount ? displayAmount({ [item.amount.currency]: item.amount.amount }, trip) : 0
}

/** The sum of items in the display currency, or null when one can't be converted. */
export function sumItems(items: { amount?: Money }[], trip: Trip): number | null {
  let sum = 0
  for (const item of items) {
    const value = itemAmount(item, trip)
    if (value == null) return null
    sum += value
  }
  return sum
}

/** One budget category: its estimate (itinerary + additional estimates) and what was spent, in the display currency. */
export interface CategoryMoney {
  category: ExpenseCategory
  /** From the itinerary (places, fares, trip-wide costs needing no booking). */
  items: MoneyItem[]
  additional: Estimate[]
  itinerary: number
  extra: number
  estimate: number
  spentItems: MoneyItem[]
  spent: number
}

/** Per category, biggest estimate first; null when an amount can't be converted (no exchange rate). */
export function categoryMoney(money: TripMoney, trip: Trip): CategoryMoney[] | null {
  const result: CategoryMoney[] = []
  for (const category of CATEGORIES) {
    const items = money.itinerary.filter((i) => i.category === category)
    const additional = (trip.estimates ?? []).filter((e) => e.category === category)
    const spentItems = money.spent.filter((i) => i.category === category)
    if (!items.length && !additional.length && !spentItems.length) continue
    const itinerary = sumItems(items, trip)
    const extra = sumItems(additional, trip)
    const spent = sumItems(spentItems, trip)
    if (itinerary == null || extra == null || spent == null) return null
    result.push({ category, items, additional, itinerary, extra, estimate: itinerary + extra, spentItems, spent })
  }
  return result.sort((a, b) => b.estimate - a.estimate)
}

/** True from the trip's first day on: only then the app talks about money really spent. */
export function tripStarted(trip: Pick<Trip, 'startDate'>): boolean {
  return today() >= trip.startDate
}
export function expensesBudget(expenses: Expense[]): Budget {
  const budget = emptyBudget()
  expenses.forEach((e) => add(budget, e.category, e.amount))
  return budget
}

/**
 * Total in the display currency: each currency converted with its rate.
 * Currencies without a rate can't be converted and are returned apart.
 * `null` when nothing at all can be converted (no rate set yet).
 */
export function inDisplayCurrency(totals: Totals, trip: Trip): { amount: number; unconverted: Money[] } | null {
  let amount = 0
  let converted = false
  const unconverted: Money[] = []
  for (const [currency, value] of Object.entries(totals)) {
    const rate = rateOf(trip, currency)
    if (rate == null) unconverted.push({ amount: value, currency })
    else {
      amount += value * rate
      if (currency !== trip.displayCurrency) converted = true
    }
  }
  // Only amounts already in the display currency and others without a rate: as if the rate weren't set.
  if (!converted && unconverted.length > 0) return null
  return { amount, unconverted }
}

/**
 * One number in the display currency, or null when that can't be done
 * exactly (a currency without a rate).
 */
export function displayAmount(totals: Totals, trip: Trip): number | null {
  const converted = inDisplayCurrency(totals, trip)
  return converted && converted.unconverted.length === 0 ? converted.amount : null
}

/** Totals as money values, base currency first. */
export function totalsList(totals: Totals, trip: Trip): Money[] {
  return Object.entries(totals)
    .map(([currency, amount]) => ({ amount, currency }))
    .sort((a, b) => Number(b.currency === trip.baseCurrency) - Number(a.currency === trip.baseCurrency))
}

// Budget totals per day and per trip. Amounts are kept per currency and only
// converted for display, with the trip's manual exchange rate
// (1 baseCurrency = exchangeRate displayCurrency).

import { legKey } from './db/legs'
import type { Day, Expense, ExpenseCategory, Leg, Place, Trip } from './db/model'
import { orderPlaces } from './db/trips'
import type { Money } from './routing/types'

/** Amount per currency code, e.g. { JPY: 12300, BRL: 200 }. */
export type Totals = Record<string, number>

export interface Budget {
  total: Totals
  byCategory: Partial<Record<ExpenseCategory, Totals>>
}

export const CATEGORIES: ExpenseCategory[] = ['activities', 'transport', 'lodging', 'food', 'shopping', 'other']

export const CATEGORY_ICON: Record<ExpenseCategory, string> = {
  activities: '🎟️',
  transport: '🚆',
  lodging: '🏨',
  food: '🍜',
  shopping: '🛍️',
  other: '📦',
}

const CATEGORY_NAME: Record<ExpenseCategory, string> = {
  activities: 'Activities',
  transport: 'Transport',
  lodging: 'Lodging',
  food: 'Food',
  shopping: 'Shopping',
  other: 'Other',
}

export const CATEGORY_LABEL = Object.fromEntries(
  CATEGORIES.map((c) => [c, `${CATEGORY_ICON[c]} ${CATEGORY_NAME[c]}`]),
) as Record<ExpenseCategory, string>

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

/**
 * Costs of one day: place fees (activities), fares of the legs between its
 * consecutive places (transport) and the day's expenses.
 */
export function dayBudget(day: Day, dayPlaces: Place[], legs: Map<string, Leg>, dayExpenses: Expense[]): Budget {
  const budget = emptyBudget()
  const places = orderPlaces(day, dayPlaces)
  places.forEach((place, i) => {
    add(budget, 'activities', place.cost)
    const next = places[i + 1]
    if (next) legs.get(legKey(place.id, next.id))?.segments.forEach((s) => add(budget, 'transport', s.fare))
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

/** Totals as money values, base currency first. */
export function totalsList(totals: Totals, trip: Trip): Money[] {
  return Object.entries(totals)
    .map(([currency, amount]) => ({ amount, currency }))
    .sort((a, b) => Number(b.currency === trip.baseCurrency) - Number(a.currency === trip.baseCurrency))
}

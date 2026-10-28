// The currencies of a trip: "my money" (displayCurrency, where totals are shown) and the ones paid in abroad,
// each with its rate to it. The main one (baseCurrency) is where new prices start.

import { COUNTRY_CURRENCY } from '../data/countries'
import type { Trip, TripCurrency } from '../db/model'

/** Currencies paid in other than "my money", main first. Trips made before keep baseCurrency + exchangeRate. */
export function tripCurrencies(trip: Trip): TripCurrency[] {
  const list =
    trip.currencies ??
    (trip.baseCurrency !== trip.displayCurrency ? [{ code: trip.baseCurrency, rate: trip.exchangeRate > 0 ? trip.exchangeRate : 0 }] : [])
  return [...list].sort((a, b) => Number(b.code === trip.baseCurrency) - Number(a.code === trip.baseCurrency))
}

/** 1 `code` = ? displayCurrency; null when that currency has no rate yet. */
export function rateOf(trip: Trip, code: string): number | null {
  if (code === trip.displayCurrency) return 1
  const rate = tripCurrencies(trip).find((c) => c.code === code)?.rate
  return rate && rate > 0 ? rate : null
}

/** Currencies to offer where a price is typed: main first, the others, "my money", plus any already used. */
export function currencyChoices(trip: Trip, ...used: (string | undefined)[]): string[] {
  return [
    ...new Set([trip.baseCurrency, ...tripCurrencies(trip).map((c) => c.code), trip.displayCurrency, ...used.filter((c): c is string => !!c)]),
  ]
}

/** Currencies of these countries that need converting to "my money". */
export function foreignCurrencies(countries: string[], displayCurrency: string): string[] {
  return [...new Set(countries.map((c) => COUNTRY_CURRENCY[c]).filter((c): c is string => !!c && c !== displayCurrency))]
}

/**
 * The trip changes to save for this list of currencies (main kept when still there, else the first, else "my
 * money"), with exchangeRate kept equal to the main one's rate for older data.
 */
export function currencyChanges(trip: Trip, currencies: TripCurrency[], displayCurrency = trip.displayCurrency): Partial<Trip> {
  const main = currencies.find((c) => c.code === trip.baseCurrency) ?? currencies[0]
  return { currencies, displayCurrency, baseCurrency: main?.code ?? displayCurrency, exchangeRate: main?.rate ?? 0 }
}

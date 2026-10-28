// Writes for a trip's countries and currencies (Trip settings → Countries & money). Rates are fetched when a
// currency is added (today's ECB rate, if online and published) and can always be typed over.

import { COUNTRY_CURRENCY } from '../data/countries'
import { currencyChanges, foreignCurrencies, tripCurrencies } from '../money/currencies'
import { fetchRate } from '../money/rates'
import { db } from './db'
import type { Trip, TripCurrency } from './model'
import { updateTrip } from './trips'

async function freshTrip(tripId: string): Promise<Trip> {
  const trip = await db.trips.get(tripId)
  if (!trip) throw new Error('Trip not found.')
  return trip
}

/** A currency with today's rate to `display` (rate 0 when it can't be fetched: typed by hand then). */
async function withRate(code: string, display: string): Promise<TripCurrency> {
  const fetched = await fetchRate(code, display)
  return fetched ? { code, rate: fetched.rate, rateDate: fetched.date } : { code, rate: 0 }
}

/** Adds currencies (skipping "my money" and those already there), each with today's rate. */
export async function addCurrencies(tripId: string, codes: string[]): Promise<void> {
  const before = await freshTrip(tripId)
  const wanted = codes.filter((c) => c !== before.displayCurrency && !tripCurrencies(before).some((x) => x.code === c))
  if (wanted.length === 0 && before.currencies) return
  const added = await Promise.all(wanted.map((c) => withRate(c, before.displayCurrency)))
  const trip = await freshTrip(tripId)
  const list = [...tripCurrencies(trip), ...added.filter((a) => !tripCurrencies(trip).some((x) => x.code === a.code))]
  await updateTrip(tripId, currencyChanges(trip, list))
}

export async function removeCurrency(tripId: string, code: string): Promise<void> {
  const trip = await freshTrip(tripId)
  await updateTrip(tripId, currencyChanges(trip, tripCurrencies(trip).filter((c) => c.code !== code)))
}

/** A rate typed by hand (no date: "Typed by you"). */
export async function setRate(tripId: string, code: string, rate: number): Promise<void> {
  const trip = await freshTrip(tripId)
  await updateTrip(tripId, currencyChanges(trip, tripCurrencies(trip).map((c) => (c.code === code ? { code, rate } : c))))
}

/** Today's rate again for these currencies; those that can't be fetched keep theirs. */
export async function refreshRates(tripId: string, codes: string[]): Promise<boolean> {
  const before = await freshTrip(tripId)
  const fetched = await Promise.all(codes.map(async (code) => [code, await fetchRate(code, before.displayCurrency)] as const))
  const trip = await freshTrip(tripId)
  let any = false
  const list = tripCurrencies(trip).map((c) => {
    const found = fetched.find(([code]) => code === c.code)?.[1]
    if (!found) return c
    any = true
    return { code: c.code, rate: found.rate, rateDate: found.date }
  })
  await updateTrip(tripId, currencyChanges(trip, list))
  return any
}

/** The currency new prices start in. */
export async function setMainCurrency(tripId: string, code: string): Promise<void> {
  const trip = await freshTrip(tripId)
  const main = tripCurrencies(trip).find((c) => c.code === code)
  if (main) await updateTrip(tripId, { baseCurrency: code, exchangeRate: main.rate })
}

/** "My money" changed: every rate was to the old one, so all are fetched again (0 when they can't be). */
export async function setDisplayCurrency(tripId: string, display: string): Promise<void> {
  const trip = await freshTrip(tripId)
  const codes = tripCurrencies(trip)
    .map((c) => c.code)
    .filter((c) => c !== display)
  const list = await Promise.all(codes.map((c) => withRate(c, display)))
  await updateTrip(tripId, currencyChanges({ ...trip, displayCurrency: display }, list, display))
}

/** A trip at home: no other currency, nothing converted. */
export async function stayAtHome(tripId: string): Promise<void> {
  const trip = await freshTrip(tripId)
  await updateTrip(tripId, currencyChanges(trip, []))
}

/** Abroad: the currencies of the trip's countries (each with today's rate). */
export async function goAbroad(tripId: string): Promise<void> {
  const trip = await freshTrip(tripId)
  await addCurrencies(tripId, foreignCurrencies(trip.countries ?? [], trip.displayCurrency))
}

/** Adds a country; abroad, its currency comes with it. */
export async function addCountry(tripId: string, country: string, abroad: boolean): Promise<void> {
  const trip = await freshTrip(tripId)
  const countries = [...new Set([...(trip.countries ?? []), country])]
  await updateTrip(tripId, { countries })
  const currency = COUNTRY_CURRENCY[country]
  if (abroad && currency) await addCurrencies(tripId, [currency])
}

/** Removes a country, and its currency when no other country of the trip uses it. */
export async function removeCountry(tripId: string, country: string): Promise<void> {
  const trip = await freshTrip(tripId)
  const countries = (trip.countries ?? []).filter((c) => c !== country)
  const currency = COUNTRY_CURRENCY[country]
  const stillUsed = countries.some((c) => COUNTRY_CURRENCY[c] === currency)
  const list = tripCurrencies(trip).filter((c) => stillUsed || c.code !== currency)
  await updateTrip(tripId, { countries, ...currencyChanges(trip, list) })
}

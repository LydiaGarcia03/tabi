// All writes to trip data go through these functions, so days and their
// ordered place lists always stay consistent.

import { dateRange } from '../dates'
import { foreignCurrencies } from '../money/currencies'
import { deleteTripMap } from '../offlineMap/download'
import { addCurrencies } from './currencies'
import { shiftStops } from './baseStops'
import { db } from './db'
import type { Day, Place, Trip } from './model'

const now = () => new Date().toISOString()
const newId = () => crypto.randomUUID()

export async function createTrip(input: { name: string; startDate: string; endDate: string; travelers?: number; countries?: string[] }): Promise<string> {
  // "My money" as on the last trip made (BRL at first); the countries' currencies come with today's rates.
  const last = (await db.trips.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).at(-1)
  const display = last?.displayCurrency ?? 'BRL'
  const trip: Trip = {
    id: newId(),
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
    travelers: input.travelers,
    baseCurrency: display,
    displayCurrency: display,
    exchangeRate: 0,
    countries: input.countries?.length ? input.countries : undefined,
    currencies: [],
    createdAt: now(),
    updatedAt: now(),
  }
  await db.transaction('rw', [db.trips, db.days, db.expenses], async () => {
    await db.trips.add(trip)
    await syncDays(trip)
  })
  const foreign = foreignCurrencies(input.countries ?? [], display)
  // Rates are fetched after the trip exists: offline or slow, the trip opens anyway (rates typed later).
  if (foreign.length) void addCurrencies(trip.id, foreign)
  return trip.id
}

export async function updateTrip(id: string, changes: Partial<Omit<Trip, 'id' | 'createdAt'>>): Promise<void> {
  await db.transaction('rw', [db.trips, db.days, db.expenses], async () => {
    await db.trips.update(id, { ...changes, updatedAt: now() })
    if (changes.startDate || changes.endDate) {
      const trip = await db.trips.get(id)
      if (trip) await syncDays(trip)
    }
  })
}

export async function deleteTrip(id: string): Promise<void> {
  await db.transaction('rw', [db.trips, db.days, db.places, db.legs, db.expenses, db.stays, db.options, db.photos], async () => {
    await db.photos.where('tripId').equals(id).delete()
    await db.options.where('tripId').equals(id).delete()
    await db.stays.where('tripId').equals(id).delete()
    await db.expenses.where('tripId').equals(id).delete()
    await db.legs.where('tripId').equals(id).delete()
    await db.places.where('tripId').equals(id).delete()
    await db.days.where('tripId').equals(id).delete()
    await db.trips.delete(id)
  })
  // Its offline map, keeping tiles another trip also uses.
  await deleteTripMap(id)
}

/**
 * Makes sure there is one day per date of the trip. Days outside the dates
 * are removed only when empty (no places, no expenses), so changing dates
 * never loses data.
 */
async function syncDays(trip: Trip): Promise<void> {
  const dates = dateRange(trip.startDate, trip.endDate)
  const existing = await db.days.where('tripId').equals(trip.id).toArray()
  const existingDates = new Set(existing.map((d) => d.date))

  const missing: Day[] = dates
    .filter((date) => !existingDates.has(date))
    .map((date) => ({ id: newId(), tripId: trip.id, date, title: '', placeIds: [] }))
  await db.days.bulkAdd(missing)

  const inRange = new Set(dates)
  const daysWithExpenses = new Set((await db.expenses.where('tripId').equals(trip.id).toArray()).map((e) => e.dayId))
  const removable = existing.filter((d) => !inRange.has(d.date) && d.placeIds.length === 0 && !daysWithExpenses.has(d.id))
  await db.days.bulkDelete(removable.map((d) => d.id))
}

export async function updateDay(id: string, changes: Pick<Day, 'title'>): Promise<void> {
  await db.days.update(id, changes)
}

export async function addPlace(dayId: string, input: Omit<Place, 'id' | 'tripId' | 'dayId' | 'notes'>): Promise<string> {
  const id = newId()
  await db.transaction('rw', db.days, db.places, async () => {
    const day = await db.days.get(dayId)
    if (!day) throw new Error('Day not found')
    await db.places.add({ ...input, id, tripId: day.tripId, dayId, notes: '' })
    await db.days.update(dayId, { placeIds: [...day.placeIds, id] })
  })
  return id
}

export async function updatePlace(id: string, changes: Partial<Omit<Place, 'id' | 'tripId' | 'dayId'>>): Promise<void> {
  await db.places.update(id, changes)
}

export async function deletePlace(id: string): Promise<void> {
  await db.transaction('rw', db.days, db.places, db.legs, async () => {
    const place = await db.places.get(id)
    if (!place) return
    const day = await db.days.get(place.dayId)
    if (day) await removeFromDay(day, id)
    await db.legs.where('fromPlaceId').equals(id).delete()
    await db.legs.where('toPlaceId').equals(id).delete()
    await db.places.delete(id)
  })
}

/** Takes a place out of a day's order; base stops after it move back one place, so they stay between the same places. */
async function removeFromDay(day: Day, placeId: string): Promise<void> {
  const index = day.placeIds.indexOf(placeId)
  await db.days.update(day.id, {
    placeIds: day.placeIds.filter((p) => p !== placeId),
    baseStops: index < 0 ? day.baseStops : shiftStops(day.baseStops, index),
  })
}

/** Moves a place up (-1) or down (+1) in its day. */
export async function movePlaceInDay(dayId: string, placeId: string, delta: -1 | 1): Promise<void> {
  await db.transaction('rw', db.days, async () => {
    const day = await db.days.get(dayId)
    if (!day) return
    const ids = [...day.placeIds]
    const from = ids.indexOf(placeId)
    const to = from + delta
    if (from < 0 || to < 0 || to >= ids.length) return
    ;[ids[from], ids[to]] = [ids[to], ids[from]]
    await db.days.update(dayId, { placeIds: ids })
  })
}

/**
 * Sets the visiting order of a day (e.g. a suggested order) and, if given,
 * each place's planned time. Legs are per place pair, so they are kept.
 */
export async function applyDayOrder(dayId: string, placeIds: string[], plannedTimes?: Map<string, string>): Promise<void> {
  await db.transaction('rw', db.days, db.places, async () => {
    const day = await db.days.get(dayId)
    if (!day) return
    // Keep any place that is not in the new list (shouldn't happen) at the end.
    const rest = day.placeIds.filter((id) => !placeIds.includes(id))
    await db.days.update(dayId, { placeIds: [...placeIds, ...rest] })
    for (const [id, plannedTime] of plannedTimes ?? []) await db.places.update(id, { plannedTime })
  })
}

/** Moves a place to the end of another day of the same trip. */
export async function movePlaceToDay(placeId: string, toDayId: string): Promise<void> {
  await db.transaction('rw', db.days, db.places, async () => {
    const place = await db.places.get(placeId)
    if (!place || place.dayId === toDayId) return
    const [from, to] = await Promise.all([db.days.get(place.dayId), db.days.get(toDayId)])
    if (!to) return
    if (from) await removeFromDay(from, placeId)
    await db.days.update(to.id, { placeIds: [...to.placeIds, placeId] })
    await db.places.update(placeId, { dayId: toDayId })
  })
}

/** Places of a day in visiting order (stray places, if any, go last). */
export function orderPlaces(day: Day, places: Place[]): Place[] {
  const byId = new Map(places.map((p) => [p.id, p]))
  const ordered = day.placeIds.map((id) => byId.get(id)).filter((p) => p != null)
  const stray = places.filter((p) => !day.placeIds.includes(p.id))
  return [...ordered, ...stray]
}

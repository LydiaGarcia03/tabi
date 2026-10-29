// "Back to base" stops between a day's places: the hotel (or station) of the
// day's city, with no details of its own, only the way there.

import { addDays } from '../dates'
import { db } from './db'
import type { BaseStop, Day, Place, Stay } from './model'
import { homeOf, staysOn } from './stays'

/** A stop of a day's route: one of its places, or a base stop (shown as "From base" / "Back to base"). */
export type RouteStop = Place & { baseStop?: BaseStop }

/**
 * Bases a day can leave from or go back to, the morning's first: where you
 * sleep (two on a travel day), else the home of a day trip, else any city's
 * base. On the first day in a new city, last night's hotel comes first: the day
 * is spent in the new city, but it starts with the way there.
 */
export function dayBases(stays: Stay[], date: string): Stay[] {
  const bases = todaysBases(stays, date)
  const yesterday = addDays(date, -1)
  const overnight = (s: Stay) => (s.kind ?? 'stay') === 'stay'
  // A stay that ended yesterday, unless yesterday was a travel day: then the night was already in the next one.
  const lastNight = stays.find(
    (s) =>
      overnight(s) &&
      s.base &&
      s.startDate <= yesterday &&
      s.endDate === yesterday &&
      !stays.some((o) => o.id !== s.id && overnight(o) && o.startDate === yesterday && o.startDate > s.startDate),
  )
  return lastNight && !bases.some((s) => s.id === lastNight.id) ? [lastNight, ...bases] : bases
}

function todaysBases(stays: Stay[], date: string): Stay[] {
  const on = staysOn(stays, date).filter((s) => s.kind !== 'day-trip' || s.base)
  const overnight = on.filter((s) => (s.kind ?? 'stay') === 'stay' && s.base).sort((a, b) => a.startDate.localeCompare(b.startDate))
  if (overnight.length > 0) return overnight
  const dayTrip = on.find((s) => s.kind === 'day-trip')
  const home = dayTrip && homeOf(stays, dayTrip)
  if (home?.base) return [home]
  return on.filter((s) => s.base)
}

/** The day in visiting order with its base stops in their slots (places given in order). */
export function dayRoute(day: Day, places: Place[]): RouteStop[] {
  const stops = day.baseStops ?? []
  const asPlace = (stop: BaseStop): RouteStop => ({
    id: stop.id,
    tripId: day.tripId,
    dayId: day.id,
    name: stop.base.name,
    lat: stop.base.lat,
    lng: stop.base.lng,
    notes: '',
    baseStop: stop,
  })
  const route: RouteStop[] = []
  for (let i = 0; i <= places.length; i++) {
    // Slots past the last place (after places were removed) count as the end, before "end" stops.
    route.push(...stops.filter((s) => s.slot !== 'end' && Math.min(s.slot, places.length) === i).map(asPlace))
    if (i < places.length) route.push(places[i])
  }
  route.push(...stops.filter((s) => s.slot === 'end').map(asPlace))
  return route
}

/** "From base" when the day starts there (first in its route, not the end stop of a day without places), else "Back to base". */
export function baseStopLabel(routeIndex: number, stop?: BaseStop): string {
  return routeIndex === 0 && stop?.slot !== 'end' ? 'From base' : 'Back to base'
}

/** Slots after a removed place (at `index` in the day's order) move back one place. */
export function shiftStops(stops: BaseStop[] | undefined, index: number): BaseStop[] | undefined {
  return stops?.map((s) => (typeof s.slot === 'number' && s.slot > index ? { ...s, slot: s.slot - 1 } : s))
}

export async function addBaseStop(dayId: string, slot: BaseStop['slot'], stay: Stay): Promise<void> {
  if (!stay.base) return
  await db.transaction('rw', db.days, async () => {
    const day = await db.days.get(dayId)
    if (!day) return
    const stop: BaseStop = { id: crypto.randomUUID(), slot, stayId: stay.id, base: stay.base! }
    await db.days.update(dayId, { baseStops: [...(day.baseStops ?? []), stop] })
  })
}

/** Uses another city's base (on a travel day). Its routes led to the old one, so they are removed. */
export async function setBaseStopStay(dayId: string, stopId: string, stay: Stay): Promise<void> {
  if (!stay.base) return
  await db.transaction('rw', db.days, db.legs, async () => {
    const day = await db.days.get(dayId)
    if (!day) return
    const stops = (day.baseStops ?? []).map((s) => (s.id === stopId ? { ...s, stayId: stay.id, base: stay.base! } : s))
    await db.days.update(dayId, { baseStops: stops })
    await deleteStopLegs(stopId)
  })
}

export async function removeBaseStop(dayId: string, stopId: string): Promise<void> {
  await db.transaction('rw', db.days, db.legs, async () => {
    const day = await db.days.get(dayId)
    if (!day) return
    await db.days.update(dayId, { baseStops: (day.baseStops ?? []).filter((s) => s.id !== stopId) })
    await deleteStopLegs(stopId)
  })
}

async function deleteStopLegs(stopId: string): Promise<void> {
  await db.legs.where('fromPlaceId').equals(stopId).delete()
  await db.legs.where('toPlaceId').equals(stopId).delete()
}

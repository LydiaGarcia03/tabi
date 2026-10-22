import { addDays, daysBetween } from '../dates'
import { iconSvg, type IconName } from '../iconPaths'
import { db } from './db'
import type { Stay, StayBase, Trip } from './model'

export async function addStay(input: Omit<Stay, 'id'>): Promise<string> {
  const id = crypto.randomUUID()
  await db.stays.add({ ...input, id })
  return id
}

export async function updateStay(id: string, changes: Partial<Omit<Stay, 'id' | 'tripId'>>): Promise<void> {
  await db.transaction('rw', db.stays, db.days, db.legs, async () => {
    await db.stays.update(id, changes)
    const stay = await db.stays.get(id)
    if (changes.base && stay) await syncBaseStops(stay, changes.base)
  })
}

/**
 * Keeps the days' "back to base" stops in sync with their stay's base
 * (renamed, or another hotel). When it moved, routes to the old spot are removed.
 */
async function syncBaseStops(stay: Stay, base: StayBase): Promise<void> {
  const days = await db.days.where('tripId').equals(stay.tripId).toArray()
  for (const day of days) {
    const stops = day.baseStops ?? []
    if (!stops.some((s) => s.stayId === stay.id)) continue
    for (const s of stops) {
      if (s.stayId !== stay.id || (s.base.lat === base.lat && s.base.lng === base.lng)) continue
      await db.legs.where('fromPlaceId').equals(s.id).delete()
      await db.legs.where('toPlaceId').equals(s.id).delete()
    }
    await db.days.update(day.id, { baseStops: stops.map((s) => (s.stayId === stay.id ? { ...s, base } : s)) })
  }
}

export async function deleteStay(id: string): Promise<void> {
  await db.stays.delete(id)
}

const isDayTrip = (stay: Stay) => stay.kind === 'day-trip'

/** The base's icon (lists and map markers): a house for a hotel (and older bases), a train for a station, a pin otherwise. */
export function baseIcon(base: Pick<StayBase, 'kind'>): IconName {
  return base.kind === 'station' ? 'station' : base.kind === 'other' ? 'pin' : 'home'
}

/** The base's map marker: its icon in white on a small tile in the place pins' red (not a pin: it's not a place of the day). */
export function baseMarkerSvg(base: Pick<StayBase, 'kind'>): string {
  return iconSvg(baseIcon(base), { size: 18, weight: 2, color: '#ffffff' })
}

/** Cities of a day: one, or two on a travel day (sorted by start; a day trip first, it's where the day is spent). */
export function staysOn(stays: Stay[], date: string): Stay[] {
  return stays
    .filter((s) => s.startDate <= date && date <= s.endDate)
    .sort((a, b) => Number(isDayTrip(b)) - Number(isDayTrip(a)) || a.startDate.localeCompare(b.startDate))
}

/** "Osaka", "Osaka → Okinawa", "Kyoto · day trip" or "" for a day without a city. */
export function cityLabel(stays: Stay[], date: string): string {
  const on = staysOn(stays, date)
  const dayTrip = on.find(isDayTrip)
  if (dayTrip) return `${dayTrip.city} · day trip`
  return on.map((s) => s.city).join(' → ')
}

/** The cities travelled through in order (stays and stops): day trips leave from one of them and come back. */
export function routeStays(stays: Stay[]): Stay[] {
  return stays.filter((s) => !isDayTrip(s)).sort((a, b) => a.startDate.localeCompare(b.startDate))
}

/** Where you sleep around a day trip: the city you stay in on its first day (else the last one before it). */
export function homeOf(stays: Stay[], dayTrip: Stay): Stay | undefined {
  const overnight = stays.filter((s) => (s.kind ?? 'stay') === 'stay').sort((a, b) => a.startDate.localeCompare(b.startDate))
  return (
    overnight.find((s) => s.startDate <= dayTrip.startDate && dayTrip.startDate <= s.endDate) ??
    overnight.filter((s) => s.endDate < dayTrip.startDate).at(-1)
  )
}

/**
 * Hotel nights for a stay: you sleep there every day of the stay and leave
 * the morning after, except on the last day of the trip. Day trips and stops
 * on the way have none.
 */
export function stayNights(stay: Stay, trip: Trip): { checkIn: string; checkOut: string; nights: number } {
  if ((stay.kind ?? 'stay') !== 'stay') return { checkIn: stay.startDate, checkOut: stay.startDate, nights: 0 }
  const checkOut = stay.endDate >= trip.endDate ? stay.endDate : addDays(stay.endDate, 1)
  const nights = Math.max(0, daysBetween(stay.startDate, checkOut))
  return { checkIn: stay.startDate, checkOut, nights }
}

/** Stay of a city (case-insensitive), the first one if there are several. */
export function stayOfCity(stays: Stay[], city: string | undefined): Stay | undefined {
  if (!city) return undefined
  const key = city.trim().toLowerCase()
  return [...stays].sort((a, b) => a.startDate.localeCompare(b.startDate)).find((s) => s.city.trim().toLowerCase() === key)
}


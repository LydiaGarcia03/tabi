import { addDays, daysBetween } from '../dates'
import { db } from './db'
import type { Stay, StayBase, Trip } from './model'

export async function addStay(input: Omit<Stay, 'id'>): Promise<string> {
  const id = crypto.randomUUID()
  await db.stays.add({ ...input, id })
  return id
}

export async function updateStay(id: string, changes: Partial<Omit<Stay, 'id' | 'tripId'>>): Promise<void> {
  await db.stays.update(id, changes)
}

export async function deleteStay(id: string): Promise<void> {
  await db.stays.delete(id)
}

const isDayTrip = (stay: Stay) => stay.kind === 'day-trip'

/** The base's pin on the maps: what it is, or a house for older bases. */
export function baseIcon(base: StayBase): string {
  return base.kind === 'hotel' ? '🏨' : base.kind === 'station' ? '🚉' : base.kind === 'other' ? '📍' : '🏠'
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


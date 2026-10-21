import { addDays, daysBetween } from '../dates'
import { db } from './db'
import type { Stay, Trip } from './model'

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

/** Cities of a day: one, or two on a travel day (sorted by start). */
export function staysOn(stays: Stay[], date: string): Stay[] {
  return stays.filter((s) => s.startDate <= date && date <= s.endDate).sort((a, b) => a.startDate.localeCompare(b.startDate))
}

/** "Osaka", "Osaka → Okinawa" or "" for a day without a city. */
export function cityLabel(stays: Stay[], date: string): string {
  return staysOn(stays, date)
    .map((s) => s.city)
    .join(' → ')
}

/**
 * Hotel nights for a stay: you sleep there every day of the stay and leave
 * the morning after, except on the last day of the trip.
 */
export function stayNights(stay: Stay, trip: Trip): { checkIn: string; checkOut: string; nights: number } {
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

/** Well-separated hues, so neighbouring cities never look alike. */
const CITY_HUES = [0, 210, 130, 280, 35, 175, 330, 60, 240, 100]

/** A stable color (hue) per city, for tags. */
export function cityHue(city: string): number {
  let hash = 0
  for (const ch of city.trim().toLowerCase()) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return CITY_HUES[hash % CITY_HUES.length]
}

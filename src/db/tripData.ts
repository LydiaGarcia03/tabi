import { db } from './db'
import type { Day, Expense, Leg, Place, Trip } from './model'

/** Everything that belongs to one trip (used by exports and backups). */
export interface TripData {
  trip: Trip
  /** Sorted by date. */
  days: Day[]
  places: Place[]
  legs: Leg[]
  expenses: Expense[]
}

export async function loadTripData(tripId: string): Promise<TripData | null> {
  return db.transaction('r', [db.trips, db.days, db.places, db.legs, db.expenses], async () => {
    const trip = await db.trips.get(tripId)
    if (!trip) return null
    const [days, places, legs, expenses] = await Promise.all([
      db.days.where('tripId').equals(tripId).sortBy('date'),
      db.places.where('tripId').equals(tripId).toArray(),
      db.legs.where('tripId').equals(tripId).toArray(),
      db.expenses.where('tripId').equals(tripId).toArray(),
    ])
    return { trip, days, places, legs, expenses }
  })
}

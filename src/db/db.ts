import Dexie, { type EntityTable } from 'dexie'
import { upgradeExpense, upgradeOption } from './migrations'
import type { Day, Expense, Leg, OptionPhoto, Place, Stay, Trip, TripOption } from './model'

export const db = new Dexie('tabi') as Dexie & {
  trips: EntityTable<Trip, 'id'>
  days: EntityTable<Day, 'id'>
  places: EntityTable<Place, 'id'>
  legs: EntityTable<Leg, 'id'>
  expenses: EntityTable<Expense, 'id'>
  stays: EntityTable<Stay, 'id'>
  options: EntityTable<TripOption, 'id'>
  photos: EntityTable<OptionPhoto, 'id'>
}

// Only indexed fields are listed; every other field is stored as well.
// Never edit a released version: add a new one (Dexie migrates existing data).
db.version(1).stores({
  trips: 'id, startDate',
  days: 'id, tripId, date',
  places: 'id, tripId, dayId',
})
db.version(2).stores({
  legs: 'id, tripId, fromPlaceId, toPlaceId, &[fromPlaceId+toPlaceId]',
})
db.version(3).stores({
  expenses: 'id, tripId, dayId',
})
db.version(4).stores({
  stays: 'id, tripId',
  options: 'id, tripId',
})
// Flights became journeys (flight, shinkansen, train…).
db.version(5)
  .stores({})
  .upgrade(async (tx) => {
    await tx.table('expenses').toCollection().modify((expense) => void upgradeExpense(expense))
    await tx.table('options').toCollection().modify((option) => void upgradeOption(option))
  })
// Photos of options, kept apart so the options list stays light.
db.version(6).stores({
  photos: 'id, tripId, optionId',
})

/** Asks the browser not to evict our data when the device is low on space. */
export async function requestPersistentStorage(): Promise<void> {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
      await navigator.storage.persist()
    }
  } catch {
    // Not supported: data is still stored, just evictable under pressure.
  }
}

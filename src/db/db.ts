import Dexie, { type EntityTable } from 'dexie'
import type { Day, Place, Trip } from './model'

export const db = new Dexie('tabi') as Dexie & {
  trips: EntityTable<Trip, 'id'>
  days: EntityTable<Day, 'id'>
  places: EntityTable<Place, 'id'>
}

// Only indexed fields are listed; every other field is stored as well.
db.version(1).stores({
  trips: 'id, startDate',
  days: 'id, tripId, date',
  places: 'id, tripId, dayId',
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

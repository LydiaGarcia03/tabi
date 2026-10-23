import Dexie, { type EntityTable } from 'dexie'
import { upgradeExpense, upgradeOption, upgradePlace } from './migrations'
import type { Day, Expense, Leg, MapArea, MapAsset, MapTile, OptionPhoto, Place, Stay, Trip, TripOption } from './model'

export const db = new Dexie('tabi') as Dexie & {
  trips: EntityTable<Trip, 'id'>
  days: EntityTable<Day, 'id'>
  places: EntityTable<Place, 'id'>
  legs: EntityTable<Leg, 'id'>
  expenses: EntityTable<Expense, 'id'>
  stays: EntityTable<Stay, 'id'>
  options: EntityTable<TripOption, 'id'>
  photos: EntityTable<OptionPhoto, 'id'>
  mapTiles: EntityTable<MapTile, 'key'>
  mapAssets: EntityTable<MapAsset, 'key'>
  mapAreas: EntityTable<MapArea, 'tripId'>
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
// Offline map (OpenStreetMap data from OpenFreeMap): a cache on this device, not part of backups.
db.version(7).stores({
  mapTiles: 'key',
  mapAssets: 'key',
  mapAreas: 'tripId',
})
// Opening hours: several time ranges per day (e.g. lunch and dinner).
db.version(8)
  .stores({})
  .upgrade(async (tx) => {
    await tx.table('places').toCollection().modify((place) => void upgradePlace(place))
  })

// Tells Drive sync that trip data changed (not the offline map cache).
const TRIP_TABLES = ['trips', 'days', 'places', 'legs', 'expenses', 'stays', 'options', 'photos']
const changeListeners = new Set<() => void>()

export function onTripDataChange(listener: () => void): () => void {
  changeListeners.add(listener)
  return () => changeListeners.delete(listener)
}

db.use({
  stack: 'dbcore',
  name: 'tripDataChanges',
  create(down) {
    return {
      ...down,
      table(name) {
        const table = down.table(name)
        if (!TRIP_TABLES.includes(name)) return table
        return {
          ...table,
          async mutate(req) {
            const result = await table.mutate(req)
            changeListeners.forEach((listener) => listener())
            return result
          },
        }
      },
    }
  },
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

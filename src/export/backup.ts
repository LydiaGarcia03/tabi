// Whole-trip backup as a JSON file: also the way to move a trip between the
// PC and the phone (export on one, import on the other).

import { db } from '../db/db'
import { upgradeExpense, upgradeOption } from '../db/migrations'
import type { TripData } from '../db/tripData'

const FORMAT = 'tabi-trip'
/**
 * 2 added stays and options (version 1 files have neither: read as empty).
 * 3 replaced flights with journeys (older files are converted on import).
 */
const VERSION = 3

interface BackupFile extends TripData {
  format: typeof FORMAT
  version: number
  exportedAt: string
  /** Device settings, only when the user chose to include them (the file is then private). */
  settings?: { rapidApiKey?: string }
}

export interface ParsedBackup {
  data: TripData
  /** NAVITIME (RapidAPI) key carried in the file, if any. */
  rapidApiKey?: string
}

export function toBackupJson(data: TripData, rapidApiKey?: string | null): string {
  const file: BackupFile = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), ...data }
  if (rapidApiKey) file.settings = { rapidApiKey }
  return JSON.stringify(file, null, 2)
}

/** Reads a backup file; throws a readable error if it isn't one. */
export function parseBackup(text: string): ParsedBackup {
  let file: Partial<BackupFile>
  try {
    file = JSON.parse(text)
  } catch {
    throw new Error('This file is not a Tabi backup (invalid JSON).')
  }
  if (file?.format !== FORMAT) throw new Error('This file is not a Tabi trip backup.')
  if (typeof file.version !== 'number' || file.version > VERSION) {
    throw new Error('This backup was made by a newer version of Tabi. Reload the app to update it, then try again.')
  }
  const { trip, days, places, legs, expenses, stays = [], options = [] } = file
  if (!trip?.id || ![days, places, legs, expenses, stays, options].every(Array.isArray)) {
    throw new Error('This backup is incomplete or damaged.')
  }
  const key = file.settings?.rapidApiKey
  return {
    data: {
      trip,
      days: days!,
      places: places!,
      legs: legs!,
      // Older files may still have flights instead of journeys.
      expenses: expenses!.map((e) => upgradeExpense(e)),
      stays,
      options: options.map((o) => upgradeOption(o)),
    },
    rapidApiKey: typeof key === 'string' && key.trim() ? key.trim() : undefined,
  }
}

export async function tripExists(tripId: string): Promise<boolean> {
  return (await db.trips.get(tripId)) != null
}

/**
 * Saves a backup. "replace" overwrites the trip with the same id (the
 * version on this device is lost); "copy" saves it as a new trip with new ids.
 * Returns the id of the saved trip.
 */
export async function importBackup(data: TripData, mode: 'replace' | 'copy'): Promise<string> {
  const saved = mode === 'copy' ? withNewIds(data) : data
  await db.transaction('rw', [db.trips, db.days, db.places, db.legs, db.expenses, db.stays, db.options], async () => {
    const id = saved.trip.id
    await db.options.where('tripId').equals(id).delete()
    await db.stays.where('tripId').equals(id).delete()
    await db.expenses.where('tripId').equals(id).delete()
    await db.legs.where('tripId').equals(id).delete()
    await db.places.where('tripId').equals(id).delete()
    await db.days.where('tripId').equals(id).delete()
    await db.trips.put(saved.trip)
    await db.days.bulkAdd(saved.days)
    await db.places.bulkAdd(saved.places)
    await db.legs.bulkAdd(saved.legs)
    await db.expenses.bulkAdd(saved.expenses)
    await db.stays.bulkAdd(saved.stays)
    await db.options.bulkAdd(saved.options)
  })
  return saved.trip.id
}

/** Same trip with fresh ids everywhere (references updated), named "… (copy)". */
function withNewIds(data: TripData): TripData {
  const ids = new Map<string, string>()
  const remap = (id: string) => {
    if (!ids.has(id)) ids.set(id, crypto.randomUUID())
    return ids.get(id)!
  }
  const tripId = remap(data.trip.id)
  const now = new Date().toISOString()
  return {
    trip: { ...data.trip, id: tripId, name: `${data.trip.name} (copy)`, createdAt: now, updatedAt: now },
    days: data.days.map((d) => ({ ...d, id: remap(d.id), tripId, placeIds: d.placeIds.map(remap) })),
    places: data.places.map((p) => ({ ...p, id: remap(p.id), tripId, dayId: remap(p.dayId) })),
    legs: data.legs.map((l) => ({
      ...l,
      id: remap(l.id),
      tripId,
      fromPlaceId: remap(l.fromPlaceId),
      toPlaceId: remap(l.toPlaceId),
    })),
    expenses: data.expenses.map((e) => ({ ...e, id: remap(e.id), tripId, dayId: e.dayId && remap(e.dayId) })),
    stays: data.stays.map((s) => ({ ...s, id: remap(s.id), tripId })),
    options: data.options.map((o) => ({
      ...o,
      id: remap(o.id),
      tripId,
      placeId: o.placeId && remap(o.placeId),
      expenseId: o.expenseId && remap(o.expenseId),
    })),
  }
}

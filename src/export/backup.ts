// Whole-trip backup as a JSON file: also the way to move a trip between the
// PC and the phone (export on one, import on the other).

import { db } from '../db/db'
import { upgradeExpense, upgradeOption, upgradePlace } from '../db/migrations'
import type { OptionPhoto } from '../db/model'
import type { TripData } from '../db/tripData'

const FORMAT = 'tabi-trip'
/**
 * 2 added stays and options (version 1 files have neither: read as empty).
 * 3 replaced flights with journeys (older files are converted on import).
 * 4 added option photos (older files have none).
 * 5 allowed several opening time ranges per day (older files are converted on import).
 */
const VERSION = 5

/** In the file, a photo's image is a "data:image/jpeg;base64,…" URL. */
type PhotoInFile = Omit<OptionPhoto, 'image'> & { image: string }
export type PhotoRef = Omit<OptionPhoto, 'image'>

interface BackupFile extends Omit<TripData, 'photos'> {
  format: typeof FORMAT
  version: number
  exportedAt: string
  photos?: PhotoInFile[]
  /** Photos without their images (Drive sync stores each image as its own file). */
  photoRefs?: PhotoRef[]
  /** Device settings, only when the user chose to include them (the file is then private). */
  settings?: { rapidApiKey?: string }
}

export interface ParsedBackup {
  data: TripData
  /** Photos whose images are stored apart (synced files); empty in exported backups. */
  photoRefs: PhotoRef[]
  /** NAVITIME (RapidAPI) key carried in the file, if any. */
  rapidApiKey?: string
}

export async function toBackupJson(data: TripData, rapidApiKey?: string | null): Promise<string> {
  const photos = await Promise.all(data.photos.map(async (p) => ({ ...p, image: await blobToDataUrl(p.image) })))
  const file: BackupFile = { format: FORMAT, version: VERSION, exportedAt: new Date().toISOString(), ...data, photos }
  if (rapidApiKey) file.settings = { rapidApiKey }
  return JSON.stringify(file, null, 2)
}

/** The same file with photos as references only (their images are uploaded separately). */
export function toBackupJsonWithoutImages(data: TripData): string {
  const { photos, ...rest } = data
  const file: BackupFile = {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    ...rest,
    photoRefs: photos.map(({ image: _image, ...ref }) => ref),
  }
  return JSON.stringify(file)
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
  const { trip, days, places, legs, expenses, stays = [], options = [], photos = [], photoRefs = [] } = file
  if (!trip?.id || ![days, places, legs, expenses, stays, options, photos, photoRefs].every(Array.isArray)) {
    throw new Error('This backup is incomplete or damaged.')
  }
  const key = file.settings?.rapidApiKey
  return {
    data: {
      trip,
      days: days!,
      // Older files have one opening time range per day.
      places: places!.map((p) => upgradePlace(p)),
      legs: legs!,
      // Older files may still have flights instead of journeys.
      expenses: expenses!.map((e) => upgradeExpense(e)),
      stays,
      options: options.map((o) => upgradeOption(o)),
      photos: photos.filter((p) => typeof p.image === 'string').map((p) => ({ ...p, image: dataUrlToBlob(p.image) })),
    },
    photoRefs,
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
  await db.transaction('rw', [db.trips, db.days, db.places, db.legs, db.expenses, db.stays, db.options, db.photos], async () => {
    const id = saved.trip.id
    await db.photos.where('tripId').equals(id).delete()
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
    await db.photos.bulkAdd(saved.photos)
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
    days: data.days.map((d) => ({
      ...d,
      id: remap(d.id),
      tripId,
      placeIds: d.placeIds.map(remap),
      baseStops: d.baseStops?.map((s) => ({ ...s, id: remap(s.id), stayId: remap(s.stayId) })),
    })),
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
    photos: data.photos.map((p) => ({ ...p, id: remap(p.id), tripId, optionId: remap(p.optionId) })),
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64 = ''] = dataUrl.split(',')
  const type = /^data:([^;]+)/.exec(header)?.[1] ?? 'image/jpeg'
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  return new Blob([bytes], { type })
}

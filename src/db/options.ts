import { db } from './db'
import type { Expense, TripOption } from './model'
import { addPlace } from './trips'

export async function addOption(input: Omit<TripOption, 'id' | 'createdAt'>): Promise<string> {
  const id = crypto.randomUUID()
  await db.options.add({ ...input, id, createdAt: new Date().toISOString() })
  return id
}

export async function updateOption(id: string, changes: Partial<Omit<TripOption, 'id' | 'tripId'>>): Promise<void> {
  await db.options.update(id, changes)
}

export async function deleteOption(id: string): Promise<void> {
  await db.options.delete(id)
}

/** Adds a located option to a day as a place (keeping a link to it) and marks it chosen. */
export async function addOptionToDay(option: TripOption, dayId: string): Promise<void> {
  if (option.lat == null || option.lng == null) throw new Error('Locate it on the map first.')
  const notes = [option.category, option.hours, option.notes, option.link].filter(Boolean).join('\n')
  const placeId = await addPlace(dayId, {
    name: option.name,
    lat: option.lat,
    lng: option.lng,
    address: option.address,
    googlePlaceId: option.googlePlaceId,
    googleFetchedAt: option.googleFetchedAt,
    cost: option.kind === 'place' ? option.price : undefined,
  })
  await db.places.update(placeId, { notes })
  await updateOption(option.id, { status: 'chosen', placeId })
}

/** Books a hotel or transport option as a trip-wide expense and marks it chosen. */
export async function bookOption(option: TripOption, expense: Omit<Expense, 'id'>): Promise<void> {
  const expenseId = crypto.randomUUID()
  await db.transaction('rw', db.expenses, db.options, async () => {
    await db.expenses.add({ ...expense, id: expenseId })
    await db.options.update(option.id, { status: 'chosen', expenseId })
  })
}

import { db } from './db'
import type { Expense, TripOption } from './model'
import { deleteExpense } from './expenses'
import { addPlace, deletePlace } from './trips'

export async function addOption(input: Omit<TripOption, 'id' | 'createdAt'>): Promise<string> {
  const id = crypto.randomUUID()
  await db.options.add({ ...input, id, createdAt: new Date().toISOString() })
  return id
}

export async function updateOption(id: string, changes: Partial<Omit<TripOption, 'id' | 'tripId'>>): Promise<void> {
  await db.options.update(id, changes)
}

/** The ★: its own flag, or the old 'favorite' status of options saved before it. */
export const isFavorite = (option: Pick<TripOption, 'status' | 'favorite'>) => !!option.favorite || option.status === 'favorite'

/**
 * Status changes that keep the ★: choosing a favorite (or putting it in the itinerary) moves an old
 * 'favorite' status into the flag.
 */
export const withStatus = (option: Pick<TripOption, 'status' | 'favorite'>, status: TripOption['status']) => ({
  status,
  favorite: isFavorite(option) || undefined,
})

/** ★ on / off, leaving chosen / in the itinerary as it is. */
export async function toggleFavorite(option: TripOption): Promise<void> {
  const on = !isFavorite(option)
  await updateOption(option.id, { favorite: on || undefined, status: option.status === 'favorite' ? 'idea' : option.status })
}

export async function deleteOption(id: string): Promise<void> {
  await db.transaction('rw', db.options, db.photos, async () => {
    await db.photos.where('optionId').equals(id).delete()
    await db.options.delete(id)
  })
}

/** Adds a located option to a day as a place (keeping a link to it) and marks it chosen. */
export async function addOptionToDay(option: TripOption, dayId: string): Promise<string> {
  if (option.lat == null || option.lng == null) throw new Error('Locate it on the map first.')
  const notes = [option.category, option.hours, option.notes, option.link].filter(Boolean).join('\n')
  const placeId = await addPlace(dayId, {
    name: option.name,
    lat: option.lat,
    lng: option.lng,
    address: option.address,
    googlePlaceId: option.googlePlaceId,
    googleFetchedAt: option.googleFetchedAt,
    cost: option.price,
    costForGroup: option.priceForGroup,
    people: option.people,
    kind: option.kind === 'restaurant' || option.kind === 'shop' ? option.kind : 'place',
  })
  await db.places.update(placeId, { notes, openingHours: option.openingHours, bookAhead: option.bookAhead, inside: option.inside })
  await updateOption(option.id, { ...withStatus(option, 'chosen'), placeId })
  return placeId
}

/**
 * Takes an option out of the itinerary: its place leaves the day (with the ways to and from it), or its
 * stay / journey leaves the trip (and the budget). The option stays, no longer chosen.
 */
export async function removeOptionFromItinerary(option: TripOption): Promise<void> {
  if (option.expenseId) await deleteExpense(option.expenseId)
  if (option.placeId) {
    await deletePlace(option.placeId)
    await updateOption(option.id, { placeId: undefined, status: option.status === 'chosen' ? 'idea' : option.status })
  }
}

/**
 * Mends options left pointing at a place that no longer exists (before 1.11.8, deleting a place from a day didn't
 * touch its option, so it kept ✓ without being in the itinerary). If the same place is in the trip again (same Google
 * place, else same name) and no other option has it, the option is linked to it (✓ + "In the itinerary"); otherwise
 * ✓ is unticked. Run once when the app starts; does nothing when everything is consistent.
 */
export async function repairOptionLinks(): Promise<void> {
  await db.transaction('rw', db.options, db.places, async () => {
    const options = await db.options.toArray()
    const places = await db.places.toArray()
    const alive = new Set(places.map((p) => p.id))
    const linked = new Set(options.map((o) => o.placeId).filter((id) => id && alive.has(id)))
    for (const option of options) {
      if (!option.placeId || alive.has(option.placeId)) continue
      const sameTrip = places.filter((p) => p.tripId === option.tripId && !linked.has(p.id))
      const match =
        (option.googlePlaceId && sameTrip.find((p) => p.googlePlaceId === option.googlePlaceId)) ||
        sameTrip.find((p) => p.name.trim() === option.name.trim())
      if (match) {
        linked.add(match.id)
        await db.options.update(option.id, { ...withStatus(option, 'chosen'), placeId: match.id })
      } else {
        await db.options.update(option.id, { placeId: undefined, status: option.status === 'chosen' ? 'idea' : option.status })
      }
    }
  })
}

/**
 * Puts a hotel or transport option into the itinerary as a trip-wide expense (a stay or journey,
 * counted in the budget) and marks it chosen. Not booked: that is a check the user ticks later.
 */
export async function addOptionToTrip(option: TripOption, expense: Omit<Expense, 'id'>): Promise<void> {
  const expenseId = crypto.randomUUID()
  await db.transaction('rw', db.expenses, db.options, async () => {
    await db.expenses.add({ ...expense, id: expenseId })
    await db.options.update(option.id, { ...withStatus(option, 'chosen'), expenseId })
  })
}

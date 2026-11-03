import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Place, Trip, TripOption } from '../db/model'
import { optionPhotos } from '../db/photos'

export interface FromOptionInfo {
  option: TripOption
  trip: Trip
  images: Blob[]
}

/**
 * The option a place was added from (its photos, rating, link…), or null for a place of its own (undefined while loading).
 * Deleting a place from a day leaves its option pointing at it; when the same place is added again (e.g. by a Google
 * search), that option is still found: one whose place no longer exists, with the same Google place or the same name
 * (User's Okinawa Churaumi Aquarium, 2026-11-03). Read only: nothing is relinked.
 */
export function useFromOption(place: Place): FromOptionInfo | null | undefined {
  return useLiveQuery(async () => {
    const options = await db.options.where('tripId').equals(place.tripId).toArray()
    let option = options.find((o) => o.placeId === place.id)
    if (!option) {
      const candidates = options.filter(
        (o) =>
          o.placeId &&
          ((place.googlePlaceId && o.googlePlaceId === place.googlePlaceId) || o.name.trim() === place.name.trim()),
      )
      if (candidates.length > 0) {
        const alive = new Set(await db.places.where('id').anyOf(candidates.map((o) => o.placeId!)).primaryKeys())
        option = candidates.find((o) => !alive.has(o.placeId!))
      }
    }
    const trip = option && (await db.trips.get(place.tripId))
    if (!option || !trip) return null
    return { option, trip, images: (await optionPhotos(option.id)).map((p) => p.image) }
  }, [place.tripId, place.id, place.googlePlaceId, place.name])
}

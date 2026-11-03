import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Place, Trip, TripOption } from '../db/model'
import { optionPhotos } from '../db/photos'

export interface FromOptionInfo {
  option: TripOption
  trip: Trip
  images: Blob[]
}

/** The option a place was added from (its photos, rating, link…), or null for a place of its own (undefined while loading). */
export function useFromOption(place: Place): FromOptionInfo | null | undefined {
  return useLiveQuery(async () => {
    const option = await db.options.where('tripId').equals(place.tripId).filter((o) => o.placeId === place.id).first()
    const trip = option && (await db.trips.get(place.tripId))
    if (!option || !trip) return null
    return { option, trip, images: (await optionPhotos(option.id)).map((p) => p.image) }
  }, [place.tripId, place.id])
}

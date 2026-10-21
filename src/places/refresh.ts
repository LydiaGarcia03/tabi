// Google Maps Platform terms allow caching a place's coordinates and address
// for 30 days (the place_id can be kept forever). When online, places whose
// Google details are older than that are fetched again.

import { useApiIsLoaded } from '@vis.gl/react-google-maps'
import { useEffect } from 'react'
import type { Place } from '../db/model'
import { updatePlace } from '../db/trips'
import { useOnline } from '../useOnline'

const MAX_AGE_DAYS = 30
/** Essentials-tier fields only (the name is the user's; it is never overwritten). */
const FIELDS = ['formattedAddress', 'location']

/** Places tried in this session, so a failing one is not retried on every render. */
const attempted = new Set<string>()

export function isStale(place: Place, now = Date.now()): boolean {
  if (!place.googlePlaceId) return false
  if (!place.googleFetchedAt) return true
  return now - new Date(place.googleFetchedAt).getTime() > MAX_AGE_DAYS * 24 * 60 * 60 * 1000
}

/** Refreshes the stale Google places in the list (1 Places request each). */
export function useRefreshStalePlaces(places: Place[] | undefined): void {
  const loaded = useApiIsLoaded()
  const online = useOnline()
  useEffect(() => {
    if (!loaded || !online || !places) return
    const stale = places.filter((p) => isStale(p) && !attempted.has(p.id))
    stale.forEach((p) => attempted.add(p.id))
    void (async () => {
      for (const place of stale) await refreshPlace(place)
    })()
  }, [loaded, online, places])
}

async function refreshPlace(place: Place): Promise<void> {
  try {
    const { Place } = (await google.maps.importLibrary('places')) as google.maps.PlacesLibrary
    const { place: fresh } = await new Place({ id: place.googlePlaceId! }).fetchFields({ fields: FIELDS })
    if (!fresh.location) return
    await updatePlace(place.id, {
      lat: fresh.location.lat(),
      lng: fresh.location.lng(),
      address: fresh.formattedAddress ?? place.address,
      googleFetchedAt: new Date().toISOString(),
    })
  } catch {
    // Keep the saved details; it will be tried again next session.
  }
}

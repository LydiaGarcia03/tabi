// The driver card's address and name in the local language, got ahead (User, 2026-10-31: no wait when the card opens):
// while a trip page is open online, every place from Google (and every city base picked from a hotel option) without
// them is asked once (1 request each, the same fields as adding a place: name and address), one at a time, and saved
// on it.

import { useApiIsLoaded } from '@vis.gl/react-google-maps'
import { useEffect } from 'react'
import { db } from '../db/db'
import type { Place, Stay, Trip } from '../db/model'
import { updateStay } from '../db/stays'
import { updatePlace } from '../db/trips'
import { fetchLocalNames } from './googlePlaces'
import { localLanguage } from './localNames'

/** Places and bases already asked this session (a failure isn't retried until the app is reopened). */
const asked = new Set<string>()

export function useFillLocalNames(trip: Trip, places: Place[] | undefined, stays: Stay[] | undefined, online: boolean): void {
  const loaded = useApiIsLoaded()
  const countries = trip.countries ?? []
  const missingPlaces = (places ?? []).filter((p) => p.googlePlaceId && !p.local?.address && !asked.has(p.id))
  const missingBases = (stays ?? []).filter((s) => s.base?.optionId && !s.base.local?.address && !asked.has(s.id))
  const key = [...missingPlaces.map((p) => p.id), ...missingBases.map((s) => s.id)].join(',')

  useEffect(() => {
    if (!online || !loaded || !key) return
    let cancelled = false
    void (async () => {
      for (const place of missingPlaces) {
        const language = localLanguage(countries, place)
        if (cancelled || !language || asked.has(place.id)) continue
        asked.add(place.id)
        try {
          const found = await fetchLocalNames(place.googlePlaceId!, language)
          if (found.address) await updatePlace(place.id, { local: { ...place.local, address: found.address, name: place.local?.name ?? found.name } })
        } catch {
          // Asked again next time the app opens.
        }
      }
      for (const stay of missingBases) {
        const base = stay.base!
        const language = localLanguage(countries, base)
        if (cancelled || !language || asked.has(stay.id)) continue
        asked.add(stay.id)
        try {
          const googlePlaceId = (await db.options.get(base.optionId!))?.googlePlaceId
          if (!googlePlaceId) continue
          const found = await fetchLocalNames(googlePlaceId, language)
          if (found.address) await updateStay(stay.id, { base: { ...base, local: { ...base.local, address: found.address, name: base.local?.name ?? found.name } } })
        } catch {
          // Asked again next time the app opens.
        }
      }
    })()
    return () => {
      cancelled = true
    }
    // `key` lists what is missing; the lists themselves are new arrays on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, loaded, key])
}
